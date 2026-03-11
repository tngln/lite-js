import type { Core } from "./index"
import common from "./common"
import config from "./config"
import style from "./style"
import keymap from "./keymap"
import translate from "./doc/translate"
import View from "./view"
import type { Doc } from "./doc/init"
import * as renderer from "../../api/renderer"
import * as system from "../../api/system"

// core is imported lazily to avoid circular deps
function __get_core(): Core {
  return (globalThis as any).__lite_core as Core
}

type RenFont = import("../../platform/renderer").RenFont

function move_to_line_offset(dv: DocView, line: number, col: number, offset: number): [number, number] {
  const xo = dv.last_x_offset
  if (xo.line !== line || xo.col !== col) {
    xo.offset = dv.get_col_x_offset(line, col)
  }
  xo.line = line + offset
  xo.col = dv.get_x_offset_col(line + offset, xo.offset)
  return [xo.line, xo.col]
}

const blink_period = 0.8

class DocView extends View {
  doc: Doc
  font: string
  last_x_offset: { line: number; col: number; offset: number }
  blink_timer: number
  mouse_selecting?: { 0: number; 1: number; clicks: number } | null
  last_line?: number
  last_col?: number

  static translate: Record<string, (doc: Doc, line: number, col: number, dv: DocView) => [number, number]> = {
    ["previous_page"]: function(doc, line, col, dv) {
      const [min, max] = dv.get_visible_line_range()
      return [line - (max - min), 1]
    },
    ["next_page"]: function(doc, line, col, dv) {
      const [min, max] = dv.get_visible_line_range()
      return [line + (max - min), 1]
    },
    ["previous_line"]: function(doc, line, col, dv) {
      if (line === 1) {
        return [1, 1]
      }
      return move_to_line_offset(dv, line, col, -1)
    },
    ["next_line"]: function(doc, line, col, dv) {
      if (line === doc.lines.length - 1) {
        return [doc.lines.length - 1, Infinity]
      }
      return move_to_line_offset(dv, line, col, 1)
    },
  }

  constructor(doc: Doc) {
    super()
    this.cursor = "ibeam"
    this.scrollable = true
    this.doc = doc
    this.font = "code_font"
    this.last_x_offset = { line: 0, col: 0, offset: 0 }
    this.blink_timer = 0
  }

  try_close(do_close: () => void) {
    if (this.doc.is_dirty() && __get_core().get_views_referencing_doc(this.doc).length === 1) {
      __get_core().command_view.enter("Unsaved Changes; Confirm Close", (_, item: any) => {
        if (item && item.text.match(/^[cC]/)) {
          do_close()
        } else if (item && item.text.match(/^[sS]/)) {
          this.doc.save()
          do_close()
        }
      }, (text: string) => {
        const items: any[] = [undefined]
        if (!/^[^cC]/.test(text)) items.push({ text: "Close Without Saving" })
        if (!/^[^sS]/.test(text)) items.push({ text: "Save And Close" })
        return items
      })
    } else {
      do_close()
    }
  }

  get_name(): string {
    const post = this.doc.is_dirty() ? "*" : ""
    const name = this.doc.get_name()
    const m = name.match(/[^/\\]*$/)
    return (m ? m[0] : name) + post
  }

  get_scrollable_size(): number {
    return this.get_line_height() * (this.doc.lines.length - 2) + this.size.y
  }

  get_font(): RenFont {
    return (style as any)[this.font] as RenFont
  }

  get_line_height(): number {
    return Math.floor((this.get_font() as any).get_height() * config.line_height)
  }

  get_gutter_width(): number {
    const font = this.get_font() as any
    return font.get_width(String(this.doc.lines.length - 1)) + style.padding.x * 2
  }

  get_line_screen_position(idx: number): [number, number] {
    const [x, y] = this.get_content_offset()
    const lh = this.get_line_height()
    const gw = this.get_gutter_width()
    return [x + gw, y + (idx - 1) * lh + style.padding.y]
  }

  get_line_text_y_offset(): number {
    const lh = this.get_line_height()
    const th = (this.get_font() as any).get_height()
    return (lh - th) / 2
  }

  get_visible_line_range(): [number, number] {
    const [, y, , y2] = this.get_content_bounds()
    const lh = this.get_line_height()
    const minline = Math.max(1, Math.floor(y / lh))
    const maxline = Math.min(this.doc.lines.length - 1, Math.floor(y2 / lh) + 1)
    return [minline, maxline]
  }

  get_col_x_offset(line: number, col: number): number {
    const text = this.doc.lines[line]
    if (!text) return 0
    const font = this.get_font() as any
    return font.get_width(text.substring(0, col - 1))
  }

  get_x_offset_col(line: number, x: number): number {
    const text = this.doc.lines[line]
    if (!text) return 1

    let xoffset = 0
    let last_i = 1
    let i = 1
    const font = this.get_font() as any
    for (const char of common.utf8_chars(text)) {
      const w = font.get_width(char)
      if (xoffset >= x) {
        return (xoffset - x > w / 2) ? last_i : i
      }
      xoffset = xoffset + w
      last_i = i
      i = i + char.length
    }

    return text.length
  }

  resolve_screen_position(x: number, y: number): [number, number] {
    const [ox, oy] = this.get_line_screen_position(1)
    let line = Math.floor((y - oy) / this.get_line_height()) + 1
    line = common.clamp(line, 1, this.doc.lines.length - 1)
    const col = this.get_x_offset_col(line, x - ox)
    return [line, col]
  }

  scroll_to_line(line: number, ignore_if_visible?: boolean, instant?: boolean) {
    const [min, max] = this.get_visible_line_range()
    if (!(ignore_if_visible && line > min && line < max)) {
      const lh = this.get_line_height()
      this.scroll.to.y = Math.max(0, lh * (line - 1) - this.size.y / 2)
      if (instant) {
        this.scroll.y = this.scroll.to.y
      }
    }
  }

  scroll_to_make_visible(line: number, col: number) {
    const lh = this.get_line_height()
    const min = lh * (line - 1)
    const max = lh * (line + 2) - this.size.y
    this.scroll.to.y = Math.min(this.scroll.to.y, min)
    this.scroll.to.y = Math.max(this.scroll.to.y, max)
    const gw = this.get_gutter_width()
    const xoffset = this.get_col_x_offset(line, col)
    const xmax = xoffset - this.size.x + gw + this.size.x / 5
    this.scroll.to.x = Math.max(0, xmax)
  }

  on_mouse_pressed(button: string, x: number, y: number, clicks: number): boolean {
    const caught = super.on_mouse_pressed(button, x, y, clicks)
    if (caught) {
      return true
    }
    if (keymap.modkeys["shift"]) {
      if (clicks === 1) {
        const [, , line1, col1] = this.doc.get_selection()
        const [line2, col2] = this.resolve_screen_position(x, y)
        this.doc.set_selection(line2, col2, line1, col1)
      }
    } else {
      const [line, col] = this.resolve_screen_position(x, y)
      this.doc.set_selection(...__mouse_selection(this.doc, clicks, line, col, line, col))
      this.mouse_selecting = { 0: line, 1: col, clicks }
    }
    this.blink_timer = 0
    return false
  }

  on_mouse_moved(x: number, y: number, dx: number, dy: number) {
    super.on_mouse_moved(x, y, dx, dy)

    if (this.scrollbar_overlaps_point(x, y) || this.dragging_scrollbar) {
      this.cursor = "arrow"
    } else {
      this.cursor = "ibeam"
    }

    if (this.mouse_selecting) {
      const [l1, c1] = this.resolve_screen_position(x, y)
      const l2 = this.mouse_selecting[0]
      const c2 = this.mouse_selecting[1]
      const clicks = this.mouse_selecting.clicks
      this.doc.set_selection(...__mouse_selection(this.doc, clicks, l1, c1, l2, c2))
    }
  }

  on_mouse_released(button: string, x: number, y: number) {
    super.on_mouse_released(button, x, y)
    this.mouse_selecting = null
  }

  on_text_input(text: string) {
    this.doc.text_input(text)
  }

  update() {
    // scroll to make caret visible and reset blink timer if it moved
    const [line, col] = this.doc.get_selection()
    if ((line !== this.last_line || col !== this.last_col) && this.size.x > 0) {
      if (__get_core().active_view === this) {
        this.scroll_to_make_visible(line, col)
      }
      this.blink_timer = 0
      this.last_line = line
      this.last_col = col
    }

    // update blink timer
    if (this === __get_core().active_view && !this.mouse_selecting) {
      const n = blink_period / 2
      const prev = this.blink_timer
      this.blink_timer = (this.blink_timer + 1 / config.fps) % blink_period
      if ((this.blink_timer > n) !== (prev > n)) {
        __get_core().redraw = true
      }
    }

    super.update()
  }

  draw_line_highlight(x: number, y: number) {
    const lh = this.get_line_height()
    renderer.draw_rect(x, y, this.size.x, lh, style.line_highlight)
  }

  draw_line_text(idx: number, x: number, y: number) {
    let tx = x
    const ty = y + this.get_line_text_y_offset()
    const font = this.get_font()
    for (const [, type, text] of this.doc.highlighter.each_token(idx)) {
      const color = style.syntax[type] || style.syntax["normal"]
      tx = renderer.draw_text(font, text, tx, ty, color)
    }
  }

  draw_line_body(idx: number, x: number, y: number) {
    const [line, col] = this.doc.get_selection()

    // draw selection if it overlaps this line
    const [line1, col1, line2, col2] = this.doc.get_selection(true)
    if (idx >= line1 && idx <= line2) {
      const text = this.doc.lines[idx]!
      let sc1 = col1
      let sc2 = col2
      if (line1 !== idx) sc1 = 1
      if (line2 !== idx) sc2 = text.length + 1
      const x1 = x + this.get_col_x_offset(idx, sc1)
      const x2 = x + this.get_col_x_offset(idx, sc2)
      const lh = this.get_line_height()
      renderer.draw_rect(x1, y, x2 - x1, lh, style.selection)
    }

    // draw line highlight if caret is on this line
    if (config.highlight_current_line && !this.doc.has_selection()
    && line === idx && __get_core().active_view === this) {
      this.draw_line_highlight(x + this.scroll.x, y)
    }

    // draw line's text
    this.draw_line_text(idx, x, y)

    // draw caret if it overlaps this line
    if (line === idx && __get_core().active_view === this
    && this.blink_timer < blink_period / 2
    && system.window_has_focus()) {
      const lh = this.get_line_height()
      const x1 = x + this.get_col_x_offset(line, col)
      renderer.draw_rect(x1, y, style.caret_width, lh, style.caret)
    }
  }

  draw_line_gutter(idx: number, x: number, y: number) {
    let color = style.line_number
    const [line1, , line2] = this.doc.get_selection(true)
    if (idx >= line1 && idx <= line2) {
      color = style.line_number2
    }
    const yoffset = this.get_line_text_y_offset()
    const gx = x + style.padding.x
    renderer.draw_text(this.get_font(), String(idx), gx, y + yoffset, color)
  }

  draw() {
    this.draw_background(style.background)

    const font = this.get_font() as any
    font.set_tab_width(font.get_width(" ") * config.indent_size)

    const [minline, maxline] = this.get_visible_line_range()
    const lh = this.get_line_height()

    let [, y] = this.get_line_screen_position(minline)
    const x = this.position.x
    for (let i = minline; i <= maxline; i++) {
      this.draw_line_gutter(i, x, y)
      y = y + lh
    }

    let [lx, ly] = this.get_line_screen_position(minline)
    const gw = this.get_gutter_width()
    const pos = this.position
    __get_core().push_clip_rect(pos.x + gw, pos.y, this.size.x, this.size.y)
    for (let i = minline; i <= maxline; i++) {
      this.draw_line_body(i, lx, ly)
      ly = ly + lh
    }
    __get_core().pop_clip_rect()

    this.draw_scrollbar()
  }
}

function __mouse_selection(doc: Doc, clicks: number, line1: number, col1: number, line2: number, col2: number): [number, number, number, number] {
  const swap = line2 < line1 || (line2 === line1 && col2 <= col1)
  if (swap) {
    ;[line1, col1, line2, col2] = [line2, col2, line1, col1]
  }
  if (clicks === 2) {
    ;[line1, col1] = translate.start_of_word(doc, line1, col1)
    ;[line2, col2] = translate.end_of_word(doc, line2, col2)
  } else if (clicks === 3) {
    if (line2 === doc.lines.length - 1 && doc.lines[doc.lines.length - 1] !== "\n") {
      doc.insert(Infinity, Infinity, "\n")
    }
    ;[line1, col1, line2, col2] = [line1, 1, line2 + 1, 1]
  }
  if (swap) {
    return [line2, col2, line1, col1]
  }
  return [line1, col1, line2, col2]
}

export { DocView }
export default DocView
