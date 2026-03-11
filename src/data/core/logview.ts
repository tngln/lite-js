import type { Core } from "./index"
import style from "./style"
import View from "./view"
import * as renderer from "../../api/renderer"

// core is imported lazily to avoid circular deps
function __get_core(): Core {
  return (globalThis as any).__lite_core as Core
}

function draw_text_multiline(font: any, text: string, x: number, y: number, color: any): [number, number] {
  const th = font.get_height()
  let resx = x
  let resy = y
  const lines = text.match(/[^\n]+/g) || []
  for (const line of lines) {
    resy = y
    resx = renderer.draw_text(style.font, line, x, y, color)
    y = y + th
  }
  return [resx, resy]
}

class LogView extends View {
  last_item: any
  yoffset: number

  constructor() {
    super()
    this.last_item = __get_core().log_items[__get_core().log_items.length - 1]
    this.scrollable = true
    this.yoffset = 0
  }

  get_name(): string {
    return "Log"
  }

  update() {
    const item = __get_core().log_items[__get_core().log_items.length - 1]
    if (this.last_item !== item) {
      this.last_item = item
      this.scroll.to.y = 0
      this.yoffset = -(style.font.get_height() + style.padding.y)
    }

    this.move_towards("yoffset", 0)

    super.update()
  }

  draw() {
    this.draw_background(style.background)

    const [ox, oy] = this.get_content_offset()
    const th = style.font.get_height()
    let y = oy + style.padding.y + this.yoffset
    const core = __get_core()

    for (let i = core.log_items.length - 1; i >= 0; i--) {
      let x = ox + style.padding.x
      const item = core.log_items[i]
      const time = new Date(item.time * 1000).toLocaleTimeString()
      x = renderer.draw_text(style.font, time, x, y, style.dim)
      x = x + style.padding.x
      const subx = x
      let [nx, ny] = draw_text_multiline(style.font, item.text, x, y, style.text)
      renderer.draw_text(style.font, " at " + item.at, nx, ny, style.dim)
      y = ny + th
      if (item.info) {
        ;[, y] = draw_text_multiline(style.font, item.info, subx, y, style.dim)
        y = y + th
      }
      y = y + style.padding.y
    }
  }
}

export { LogView }
export default LogView
