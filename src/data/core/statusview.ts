import type { Core } from "./index"
import common from "./common"
import command from "./command"
import config from "./config"
import style from "./style"
import { DocView } from "./docview"
import { LogView } from "./logview"
import View from "./view"
import * as renderer from "../../api/renderer"
import * as system from "../../api/system"

// core is imported lazily to avoid circular deps
function __get_core(): Core {
  return (globalThis as any).__lite_core as Core
}

function draw_items(self: StatusView, items: any[], x: number, y: number, draw_fn: (font: any, color: any, text: string, align: any, x: number, y: number, w: number, h: number) => number): number {
  let font: any = style.font
  let color: any = style.text

  for (let i = 1; i <= items.length - 1; i++) {
    const item = items[i]
    if (item && typeof item === "object" && "get_width" in item) {
      // it's a font
      font = item
    } else if (Array.isArray(item)) {
      // it's a color
      color = item
    } else if (typeof item === "string" || typeof item === "number") {
      x = draw_fn(font, color, String(item), null, x, y, 0, self.size.y)
    }
  }

  return x
}

function text_width(font: any, _color: any, text: string, _align: any, x: number): number {
  return x + font.get_width(text)
}

class StatusView extends View {
  static separator = "      "
  static separator2 = "   |   "
  message_timeout: number
  message: any[]

  constructor() {
    super()
    this.message_timeout = 0
    this.message = []
  }

  on_mouse_pressed(_button: string, _x: number, _y: number, _clicks: number): boolean {
    const core = __get_core()
    core.set_active_view(core.last_active_view!)
    if (system.get_time() < this.message_timeout
    && !(core.active_view instanceof LogView)) {
      command.perform("core:open-log")
    }
    return false
  }

  show_message(icon: string, icon_color: any, text: string) {
    this.message = [
      undefined,
      icon_color, style.icon_font, icon,
      style.dim, style.font, StatusView.separator2, style.text, text
    ]
    this.message_timeout = system.get_time() + config.message_timeout
  }

  update() {
    this.size.y = (style.font as any).get_height() + style.padding.y * 2

    if (system.get_time() < this.message_timeout) {
      this.scroll.to.y = this.size.y
    } else {
      this.scroll.to.y = 0
    }

    super.update()
  }

  draw_items(items: any[], right_align?: boolean, yoffset?: number) {
    const [x0, y0] = this.get_content_offset()
    let x = x0
    const y = y0 + (yoffset || 0)
    if (right_align) {
      const w = draw_items(this, items, 0, 0, text_width as any)
      x = x + this.size.x - w - style.padding.x
      draw_items(this, items, x, y, common.draw_text as any)
    } else {
      x = x + style.padding.x
      draw_items(this, items, x, y, common.draw_text as any)
    }
  }

  get_items(): [any[], any[]] {
    const core = __get_core()
    if (core.active_view instanceof DocView) {
      const dv = core.active_view as DocView
      const [line, col] = dv.doc.get_selection()
      const dirty = dv.doc.is_dirty()

      return [
        [
          undefined,
          dirty ? style.accent : style.text, style.icon_font, "f",
          style.dim, style.font, StatusView.separator2, style.text,
          dv.doc.filename ? style.text : style.dim, dv.doc.get_name(),
          style.text,
          StatusView.separator,
          "line: ", line,
          StatusView.separator,
          col > config.line_limit ? style.accent : style.text, "col: ", col,
          style.text,
          StatusView.separator,
          `${Math.floor(line / (core.active_view as DocView).doc.lines.length * 100)}%`,
        ],
        [
          undefined,
          style.icon_font, "g",
          style.font, style.dim, StatusView.separator2, style.text,
          (core.active_view as DocView).doc.lines.length - 1, " lines",
          StatusView.separator,
          (core.active_view as DocView).doc.crlf ? "CRLF" : "LF",
        ],
      ]
    }

    return [
      [undefined],
      [
        undefined,
        style.icon_font, "g",
        style.font, style.dim, StatusView.separator2,
        core.docs.length, style.text, " / ",
        core.project_files.length, " files",
      ],
    ]
  }

  draw() {
    this.draw_background(style.background2)

    if (this.message && this.message.length > 1) {
      this.draw_items(this.message, false, this.size.y)
    }

    const [left, right] = this.get_items()
    this.draw_items(left)
    this.draw_items(right, true)
  }
}

export { StatusView }
export default StatusView
