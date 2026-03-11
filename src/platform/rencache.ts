import {
  type RenColor,
  type RenFont,
  type RenRect,
  ren_draw_rect,
  ren_draw_text,
  ren_get_font_height,
  ren_get_font_tab_width,
  ren_get_font_width,
  ren_get_size,
  ren_set_clip_rect,
  ren_set_font_tab_width,
  ren_update_rects,
  ren_free_font,
} from "./renderer"

const CELLS_X = 80
const CELLS_Y = 50
const CELL_SIZE = 96
const COMMAND_BUF_SIZE = 1024 * 512

const FREE_FONT = 0
const SET_CLIP = 1
const DRAW_TEXT = 2
const DRAW_RECT = 3

type Command = {
  type: number
  size: number
  rect: RenRect
  color: RenColor
  font: RenFont | null
  tab_width: number
  text: string
}

const cells_buf1 = new Uint32Array(CELLS_X * CELLS_Y)
const cells_buf2 = new Uint32Array(CELLS_X * CELLS_Y)
let cells_prev = cells_buf1
let cells = cells_buf2

const rect_buf: RenRect[] = Array.from({ length: (CELLS_X * CELLS_Y) / 2 }, () => ({
  x: 0,
  y: 0,
  width: 0,
  height: 0,
}))

const command_buf: Command[] = []
let command_buf_idx = 0
let screen_rect: RenRect = { x: 0, y: 0, width: 0, height: 0 }
let show_debug = false

function min(a: number, b: number) { return a < b ? a : b }
function max(a: number, b: number) { return a > b ? a : b }

const HASH_INITIAL = 2166136261

function hash(h: number, data: Uint8Array) {
  for (let i = 0; i < data.length; i++) {
    h = (h ^ data[i]) >>> 0
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

function hash_u32_into(h: number, v: number) {
  const b0 = v & 0xff
  const b1 = (v >>> 8) & 0xff
  const b2 = (v >>> 16) & 0xff
  const b3 = (v >>> 24) & 0xff
  h = (h ^ b0) >>> 0
  h = Math.imul(h, 16777619) >>> 0
  h = (h ^ b1) >>> 0
  h = Math.imul(h, 16777619) >>> 0
  h = (h ^ b2) >>> 0
  h = Math.imul(h, 16777619) >>> 0
  h = (h ^ b3) >>> 0
  h = Math.imul(h, 16777619) >>> 0
  return h >>> 0
}

function cell_idx(x: number, y: number) {
  return x + y * CELLS_X
}

function rects_overlap(a: RenRect, b: RenRect) {
  return b.x + b.width >= a.x && b.x <= a.x + a.width
    && b.y + b.height >= a.y && b.y <= a.y + a.height
}

function intersect_rects(a: RenRect, b: RenRect): RenRect {
  const x1 = max(a.x, b.x)
  const y1 = max(a.y, b.y)
  const x2 = min(a.x + a.width, b.x + b.width)
  const y2 = min(a.y + a.height, b.y + b.height)
  return { x: x1, y: y1, width: max(0, x2 - x1), height: max(0, y2 - y1) }
}

function merge_rects(a: RenRect, b: RenRect): RenRect {
  const x1 = min(a.x, b.x)
  const y1 = min(a.y, b.y)
  const x2 = max(a.x + a.width, b.x + b.width)
  const y2 = max(a.y + a.height, b.y + b.height)
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
}

function push_command(type: number, size: number) {
  const n = command_buf_idx + size
  if (n > COMMAND_BUF_SIZE) {
    console.warn("Warning: (rencache.ts): exhausted command buffer")
    return null
  }
  command_buf_idx = n
  const cmd: Command = {
    type,
    size,
    rect: { x: 0, y: 0, width: 0, height: 0 },
    color: { r: 0, g: 0, b: 0, a: 0 },
    font: null,
    tab_width: 0,
    text: "",
  }
  command_buf.push(cmd)
  return cmd
}

function command_iter() {
  return command_buf
}

let __font_id_next = 1
const __font_ids = new WeakMap<object, number>()

function __font_id(font: RenFont | null) {
  if (!font) return 0
  const key = font as unknown as object
  const existing = __font_ids.get(key)
  if (existing !== undefined) return existing
  const id = __font_id_next++
  __font_ids.set(key, id)
  return id
}

const __text_encoder = new TextEncoder()

function command_hash(cmd: Command) {
  let h = HASH_INITIAL
  h = hash_u32_into(h, cmd.type | 0)
  h = hash_u32_into(h, cmd.size | 0)
  h = hash_u32_into(h, cmd.rect.x | 0)
  h = hash_u32_into(h, cmd.rect.y | 0)
  h = hash_u32_into(h, cmd.rect.width | 0)
  h = hash_u32_into(h, cmd.rect.height | 0)

  const c = cmd.color
  const color_u32 = ((c.a & 0xff) << 24) | ((c.r & 0xff) << 16) | ((c.g & 0xff) << 8) | (c.b & 0xff)
  h = hash_u32_into(h, color_u32 >>> 0)

  h = hash_u32_into(h, __font_id(cmd.font) >>> 0)
  h = hash_u32_into(h, cmd.tab_width | 0)

  if (cmd.type === DRAW_TEXT) {
    const bytes = __text_encoder.encode(cmd.text)
    h = hash(h, bytes)
    h = hash_u32_into(h, 0)
  }

  return h >>> 0
}

function update_overlapping_cells(r: RenRect, h: number) {
  let x1 = Math.floor(r.x / CELL_SIZE)
  let y1 = Math.floor(r.y / CELL_SIZE)
  let x2 = Math.floor((r.x + r.width) / CELL_SIZE)
  let y2 = Math.floor((r.y + r.height) / CELL_SIZE)

  if (x2 < 0 || y2 < 0) return
  if (x1 >= CELLS_X || y1 >= CELLS_Y) return
  x1 = max(0, min(CELLS_X - 1, x1))
  y1 = max(0, min(CELLS_Y - 1, y1))
  x2 = max(0, min(CELLS_X - 1, x2))
  y2 = max(0, min(CELLS_Y - 1, y2))

  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      const idx = cell_idx(x, y)
      cells[idx] = hash_u32_into(cells[idx], h) >>> 0
    }
  }
}

function push_rect(r: RenRect, count: number) {
  for (let i = count - 1; i >= 0; i--) {
    const rp = rect_buf[i]
    if (rects_overlap(rp, r)) {
      rect_buf[i] = merge_rects(rp, r)
      return count
    }
  }
  rect_buf[count] = r
  return count + 1
}

function rencache_show_debug(enable: boolean) {
  show_debug = enable
}

function rencache_free_font(font: RenFont) {
  const cmd = push_command(FREE_FONT, 32)
  if (cmd) cmd.font = font
}

function rencache_set_clip_rect(rect: RenRect) {
  const cmd = push_command(SET_CLIP, 32)
  if (cmd) cmd.rect = intersect_rects(rect, screen_rect)
}

function rencache_draw_rect(rect: RenRect, color: RenColor) {
  if (!rects_overlap(screen_rect, rect)) return
  const cmd = push_command(DRAW_RECT, 32)
  if (cmd) {
    cmd.rect = rect
    cmd.color = color
  }
}

function rencache_draw_text(font: RenFont, text: string, x: number, y: number, color: RenColor) {
  const rect: RenRect = {
    x,
    y,
    width: ren_get_font_width(font, text),
    height: ren_get_font_height(font),
  }

  if (rects_overlap(screen_rect, rect)) {
    const sz = __text_encoder.encode(text).length + 1
    const cmd = push_command(DRAW_TEXT, 32 + sz)
    if (cmd) {
      cmd.text = text
      cmd.color = color
      cmd.font = font
      cmd.rect = rect
      cmd.tab_width = ren_get_font_tab_width(font)
    }
  }

  return x + rect.width
}

function rencache_invalidate() {
  for (let i = 0; i < cells_prev.length; i++) {
    cells_prev[i] = 0xffffffff
  }
}

function rencache_begin_frame() {
  const [w, h] = ren_get_size()
  if (screen_rect.width !== w || h !== screen_rect.height) {
    screen_rect.width = w
    screen_rect.height = h
    rencache_invalidate()
  }
}

function rencache_end_frame() {
  let cr = screen_rect
  for (const cmd of command_iter()) {
    if (cmd.type === SET_CLIP) cr = cmd.rect
    const r = intersect_rects(cmd.rect, cr)
    if (r.width === 0 || r.height === 0) continue
    const h = command_hash(cmd)
    update_overlapping_cells(r, h)
  }

  let rect_count = 0
  const max_x = Math.floor(screen_rect.width / CELL_SIZE) + 1
  const max_y = Math.floor(screen_rect.height / CELL_SIZE) + 1
  const lim_x = min(max_x, CELLS_X)
  const lim_y = min(max_y, CELLS_Y)
  for (let y = 0; y < lim_y; y++) {
    for (let x = 0; x < lim_x; x++) {
      const idx = cell_idx(x, y)
      if (cells[idx] !== cells_prev[idx]) {
        rect_count = push_rect({ x, y, width: 1, height: 1 }, rect_count)
      }
      cells_prev[idx] = HASH_INITIAL
    }
  }

  for (let i = 0; i < rect_count; i++) {
    const r = rect_buf[i]
    const pr: RenRect = {
      x: r.x * CELL_SIZE,
      y: r.y * CELL_SIZE,
      width: r.width * CELL_SIZE,
      height: r.height * CELL_SIZE,
    }
    rect_buf[i] = intersect_rects(pr, screen_rect)
  }

  let has_free_commands = false
  for (let i = 0; i < rect_count; i++) {
    const r = rect_buf[i]
    ren_set_clip_rect(r)

    for (const cmd of command_iter()) {
      switch (cmd.type) {
        case FREE_FONT:
          has_free_commands = true
          break
        case SET_CLIP:
          ren_set_clip_rect(intersect_rects(cmd.rect, r))
          break
        case DRAW_RECT:
          ren_draw_rect(cmd.rect, cmd.color)
          break
        case DRAW_TEXT:
          if (cmd.font) {
            ren_set_font_tab_width(cmd.font, cmd.tab_width)
            ren_draw_text(cmd.font, cmd.text, cmd.rect.x, cmd.rect.y, cmd.color)
          }
          break
      }
    }

    if (show_debug) {
      const color: RenColor = {
        r: Math.floor(Math.random() * 256),
        g: Math.floor(Math.random() * 256),
        b: Math.floor(Math.random() * 256),
        a: 50,
      }
      ren_draw_rect(r, color)
    }
  }

  if (rect_count > 0) {
    ren_update_rects(rect_buf, rect_count)
  }

  if (has_free_commands) {
    for (const cmd of command_iter()) {
      if (cmd.type === FREE_FONT && cmd.font) {
        ren_free_font(cmd.font)
      }
    }
  }

  const tmp = cells
  cells = cells_prev
  cells_prev = tmp
  command_buf.length = 0
  command_buf_idx = 0
  for (let i = 0; i < cells.length; i++) {
    cells[i] = HASH_INITIAL
  }
}

export {
  rencache_show_debug,
  rencache_free_font,
  rencache_set_clip_rect,
  rencache_draw_rect,
  rencache_draw_text,
  rencache_invalidate,
  rencache_begin_frame,
  rencache_end_frame,
}

