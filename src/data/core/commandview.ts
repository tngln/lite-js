import type { Core } from "./index"
import common from "./common"
import style from "./style"
import { Doc } from "./doc/init"
import { DocView } from "./docview"
import View from "./view"
import * as renderer from "../../api/renderer"

// core is imported lazily to avoid circular deps
function __get_core(): Core {
  return (globalThis as any).__lite_core as Core
}

class SingleLineDoc extends Doc {
  insert(line: number, col: number, text: string) {
    super.insert(line, col, text.replace(/\n/g, ""))
  }
}

const max_suggestions = 10

const noop = () => {}

type State = {
  submit: (text: string, item?: any) => void
  suggest: (text: string) => any[]
  cancel: (explicit?: boolean) => void
}

const default_state: State = {
  submit: noop,
  suggest: noop as any,
  cancel: noop,
}

class CommandView extends DocView {
  suggestion_idx: number
  suggestions: any[]
  suggestions_height: number
  last_change_id: number
  gutter_width: number
  gutter_text_brightness: number
  selection_offset: number
  state: State
  label: string
  [key: string]: any

  constructor() {
    super(new SingleLineDoc())
    this.suggestion_idx = 1
    this.suggestions = [undefined]
    this.suggestions_height = 0
    this.last_change_id = 0
    this.gutter_width = 0
    this.gutter_text_brightness = 0
    this.selection_offset = 0
    this.state = default_state
    this.font = "font"
    this.size.y = 0
    this.label = ""
  }

  get_name(): string {
    return View.prototype.get_name.call(this)
  }

  get_line_screen_position(_idx?: number): [number, number] {
    const [x] = super.get_line_screen_position(1)
    const [, y] = this.get_content_offset()
    const lh = this.get_line_height()
    return [x, y + (this.size.y - lh) / 2]
  }

  get_scrollable_size(): number {
    return 0
  }

  scroll_to_make_visible(_line?: number, _col?: number) {
    // no-op function to disable this functionality
  }

  get_text(): string {
    return this.doc.get_text(1, 1, 1, Infinity)
  }

  set_text(text: string, select?: boolean) {
    this.doc.remove(1, 1, Infinity, Infinity)
    this.doc.text_input(text)
    if (select) {
      this.doc.set_selection(Infinity, Infinity, 1, 1)
    }
  }

  move_suggestion_idx(dir: number) {
    const n = this.suggestion_idx + dir
    this.suggestion_idx = common.clamp(n, 1, this.suggestions.length - 1)
    this.complete()
    this.last_change_id = this.doc.get_change_id()
  }

  complete() {
    if (this.suggestions.length > 1) {
      this.set_text(this.suggestions[this.suggestion_idx].text)
    }
  }

  submit() {
    const suggestion = this.suggestions[this.suggestion_idx]
    const text = this.get_text()
    const submit = this.state.submit
    this.exit(true)
    submit(text, suggestion)
  }

  enter(text: string, submit?: (text: string, item?: any) => void, suggest?: (text: string) => any[], cancel?: (explicit?: boolean) => void) {
    if (this.state !== default_state) {
      return
    }
    this.state = {
      submit: submit || noop,
      suggest: suggest || (noop as any),
      cancel: cancel || noop,
    }
    __get_core().set_active_view(this)
    this.update_suggestions()
    this.gutter_text_brightness = 100
    this.label = text + ": "
  }

  exit(submitted?: boolean, inexplicit?: boolean) {
    const core = __get_core()
    if (core.active_view === this) {
      core.set_active_view(core.last_active_view!)
    }
    const cancel = this.state.cancel
    this.state = default_state
    this.doc.reset()
    this.suggestions = [undefined]
    if (!submitted) cancel(!inexplicit)
  }

  get_gutter_width(): number {
    return this.gutter_width
  }

  get_suggestion_line_height(): number {
    return (this.get_font() as any).get_height() + style.padding.y
  }

  update_suggestions() {
    const t = this.state.suggest(this.get_text()) || []
    const res: any[] = [undefined]
    for (let i = 1; i <= Math.min(t.length - 1, max_suggestions - 1); i++) {
      let item = t[i]
      if (typeof item === "string") {
        item = { text: item }
      }
      res.push(item)
    }
    this.suggestions = res
    this.suggestion_idx = 1
  }

  update() {
    super.update()

    const core = __get_core()
    if (core.active_view !== this && this.state !== default_state) {
      this.exit(false, true)
    }

    // update suggestions if text has changed
    if (this.last_change_id !== this.doc.get_change_id()) {
      this.update_suggestions()
      this.last_change_id = this.doc.get_change_id()
    }

    // update gutter text color brightness
    this.move_towards("gutter_text_brightness", 0, 0.1)

    // update gutter width
    const dest = (this.get_font() as any).get_width(this.label) + style.padding.x
    if (this.size.y <= 0) {
      this.gutter_width = dest
    } else {
      this.move_towards("gutter_width", dest)
    }

    // update suggestions box height
    const lh = this.get_suggestion_line_height()
    const dest_h = (this.suggestions.length - 1) * lh
    this.move_towards("suggestions_height", dest_h)

    // update suggestion cursor offset
    const dest_s = this.suggestion_idx * this.get_suggestion_line_height()
    this.move_towards("selection_offset", dest_s)

    // update size based on whether this is the active_view
    let dest_y = 0
    if (this === core.active_view) {
      dest_y = (style.font as any).get_height() + style.padding.y * 2
    }
    this.move_towards(this.size, "y", dest_y)
  }

  draw_line_highlight(_x?: number, _y?: number) {
    // no-op function to disable this functionality
  }

  draw_line_gutter(idx: number, x: number, y: number) {
    const yoffset = this.get_line_text_y_offset()
    const pos = this.position
    const color = common.lerp(style.text, style.accent, this.gutter_text_brightness / 100)
    __get_core().push_clip_rect(pos.x, pos.y, this.get_gutter_width(), this.size.y)
    const gx = x + style.padding.x
    renderer.draw_text(this.get_font(), this.label, gx, y + yoffset, color)
    __get_core().pop_clip_rect()
  }

  draw() {
    super.draw()
    __get_core().root_view.defer_draw(__draw_suggestions_box, this)
  }
}

function __draw_suggestions_box(self: CommandView) {
  const lh = self.get_suggestion_line_height()
  const dh = style.divider_size
  const [x] = self.get_line_screen_position()
  const h = Math.ceil(self.suggestions_height)
  const rx = self.position.x
  const ry = self.position.y - h - dh
  const rw = self.size.x
  const rh = h

  // draw suggestions background
  if (self.suggestions.length > 1) {
    renderer.draw_rect(rx, ry, rw, rh, style.background3)
    renderer.draw_rect(rx, ry - dh, rw, dh, style.divider)
    const sy = self.position.y - self.selection_offset - dh
    renderer.draw_rect(rx, sy, rw, lh, style.line_highlight)
  }

  // draw suggestion text
  __get_core().push_clip_rect(rx, ry, rw, rh)
  for (let i = 1; i <= self.suggestions.length - 1; i++) {
    const item = self.suggestions[i]
    const color = (i === self.suggestion_idx) ? style.accent : style.text
    const sy = self.position.y - i * lh - dh
    common.draw_text(self.get_font() as any, color as any, item.text, null, x, sy, 0, lh)

    if (item.info) {
      const w = self.size.x - x - style.padding.x
      common.draw_text(self.get_font() as any, style.dim as any, item.info, "right", x, sy, w, lh)
    }
  }
  __get_core().pop_clip_rect()
}

export { CommandView }
export default CommandView
