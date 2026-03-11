import type { Core } from "./index"
import config from "./config"
import style from "./style"
import common from "./common"
import * as renderer from "../../api/renderer"

// core is imported lazily to avoid circular deps
let _core: Core | null = null
function __get_core(): Core {
  if (!_core) {
    _core = (globalThis as any).__lite_core as Core
  }
  return _core!
}

class View {
  position: { x: number; y: number }
  size: { x: number; y: number }
  scroll: { x: number; y: number; to: { x: number; y: number } }
  cursor: string
  scrollable: boolean
  dragging_scrollbar?: boolean
  hovered_scrollbar?: boolean
  [key: string]: any

  constructor() {
    this.position = { x: 0, y: 0 }
    this.size = { x: 0, y: 0 }
    this.scroll = { x: 0, y: 0, to: { x: 0, y: 0 } }
    this.cursor = "arrow"
    this.scrollable = false
  }

  move_towards(t: any, k: string | any, dest?: number, rate?: number): void {
    if (typeof t !== "object" || Array.isArray(t)) {
      // move_towards(t, k, dest, rate) where t is a table key on self
      // called as self:move_towards(t, k, dest, rate)
      return this.move_towards(this, t, k, dest)
    }
    const val = t[k] as number
    if (Math.abs(val - (dest as number)) < 0.5) {
      t[k] = dest
    } else {
      t[k] = common.lerp(val, dest as number, rate ?? 0.5)
    }
    if (val !== dest) {
      __get_core().redraw = true
    }
  }

  try_close(do_close: () => void) {
    do_close()
  }

  get_name(): string {
    return "---"
  }

  get_scrollable_size(): number {
    return Infinity
  }

  get_scrollbar_rect(): [number, number, number, number] {
    const sz = this.get_scrollable_size()
    if (sz <= this.size.y || sz === Infinity) {
      return [0, 0, 0, 0]
    }
    const h = Math.max(20, this.size.y * this.size.y / sz)
    return [
      this.position.x + this.size.x - style.scrollbar_size,
      this.position.y + this.scroll.y * (this.size.y - h) / (sz - this.size.y),
      style.scrollbar_size,
      h,
    ]
  }

  scrollbar_overlaps_point(x: number, y: number): boolean {
    const [sx, sy, sw, sh] = this.get_scrollbar_rect()
    return x >= sx - sw * 3 && x < sx + sw && y >= sy && y < sy + sh
  }

  on_mouse_pressed(button: string, x: number, y: number, clicks: number): boolean {
    if (this.scrollbar_overlaps_point(x, y)) {
      this.dragging_scrollbar = true
      return true
    }
    return false
  }

  on_mouse_released(button: string, x: number, y: number) {
    this.dragging_scrollbar = false
  }

  on_mouse_moved(x: number, y: number, dx: number, dy: number) {
    if (this.dragging_scrollbar) {
      const delta = this.get_scrollable_size() / this.size.y * dy
      this.scroll.to.y = this.scroll.to.y + delta
    }
    this.hovered_scrollbar = this.scrollbar_overlaps_point(x, y)
  }

  on_text_input(text: string) {
    // no-op
  }

  on_mouse_wheel(y: number) {
    if (this.scrollable) {
      this.scroll.to.y = this.scroll.to.y + y * -config.mouse_wheel_scroll
    }
  }

  get_content_bounds(): [number, number, number, number] {
    const x = this.scroll.x
    const y = this.scroll.y
    return [x, y, x + this.size.x, y + this.size.y]
  }

  get_content_offset(): [number, number] {
    const x = common.round(this.position.x - this.scroll.x)
    const y = common.round(this.position.y - this.scroll.y)
    return [x, y]
  }

  clamp_scroll_position() {
    const max = this.get_scrollable_size() - this.size.y
    this.scroll.to.y = common.clamp(this.scroll.to.y, 0, max)
  }

  update() {
    this.clamp_scroll_position()
    this.move_towards(this.scroll, "x", this.scroll.to.x, 0.3)
    this.move_towards(this.scroll, "y", this.scroll.to.y, 0.3)
  }

  draw_background(color: any) {
    const x = this.position.x
    const y = this.position.y
    const w = this.size.x
    const h = this.size.y
    renderer.draw_rect(x, y, w + x % 1, h + y % 1, color)
  }

  draw_scrollbar() {
    const [x, y, w, h] = this.get_scrollbar_rect()
    const highlight = this.hovered_scrollbar || this.dragging_scrollbar
    const color = highlight ? style.scrollbar2 : style.scrollbar
    renderer.draw_rect(x, y, w, h, color)
  }

  draw() {
    // no-op
  }

  is(T: any): boolean {
    return this instanceof T
  }
}

export { View }
export default View
