import type { Core } from "./index"
import common from "./common"
import style from "./style"
import keymap from "./keymap"
import View from "./view"
import { DocView } from "./docview"
import * as renderer from "../../api/renderer"
import * as system from "../../api/system"

// core is imported lazily to avoid circular deps
function __get_core(): Core {
  return (globalThis as any).__lite_core as Core
}

type Doc = import("./doc/init").Doc

class EmptyView extends View {
  draw() {
    this.draw_background(style.background)
    const [w, h] = draw_text(0, 0, [0, 0, 0, 0] as any)
    const x = this.position.x + Math.max(style.padding.x, (this.size.x - w) / 2)
    const y = this.position.y + (this.size.y - h) / 2
    draw_text(x, y, style.dim)
  }
}

function draw_text(x: number, y: number, color: any): [number, number] {
  const th = (style.big_font as any).get_height()
  const dh = th + style.padding.y * 2
  x = renderer.draw_text(style.big_font, "lite", x, y + (dh - th) / 2, color)
  x = x + style.padding.x
  renderer.draw_rect(x, y, Math.ceil(1 * (typeof window !== "undefined" ? window.devicePixelRatio : 1)), dh, color)
  const lines = [
    { fmt: "%s to run a command", cmd: "core:find-command" },
    { fmt: "%s to open a file from the project", cmd: "core:find-file" },
  ]
  const th2 = (style.font as any).get_height()
  y = y + (dh - th2 * 2 - style.padding.y) / 2
  let w = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const binding = keymap.get_binding(line.cmd) || ""
    const text = line.fmt.replace("%s", binding)
    const nx = renderer.draw_text(style.font, text, x + style.padding.x, y, color)
    w = Math.max(w, nx)
    y = y + th2 + style.padding.y
  }
  return [w, dh]
}

function copy_position_and_size(dst: Node | View, src: Node | View) {
  dst.position.x = src.position.x
  dst.position.y = src.position.y
  dst.size.x = src.size.x
  dst.size.y = src.size.y
}

// calculating the sizes is the same for hsplits and vsplits, except the x/y
// axis are swapped; this function lets us use the same code for both
function calc_split_sizes(node: Node, x: "x" | "y", y: "x" | "y", x1?: number, x2?: number) {
  let n: number
  const ds = (x1 !== undefined && x1 < 1 || x2 !== undefined && x2 < 1) ? 0 : style.divider_size
  if (x1 !== undefined) {
    n = x1 + ds
  } else if (x2 !== undefined) {
    n = node.size[x] - x2
  } else {
    n = Math.floor(node.size[x] * node.divider)
  }
  node.a!.position[x] = node.position[x]
  node.a!.position[y] = node.position[y]
  node.a!.size[x] = n - ds
  node.a!.size[y] = node.size[y]
  node.b!.position[x] = node.position[x] + n
  node.b!.position[y] = node.position[y]
  node.b!.size[x] = node.size[x] - n
  node.b!.size[y] = node.size[y]
}

const type_map: Record<string, string> = { up: "vsplit", down: "vsplit", left: "hsplit", right: "hsplit" }

class Node {
  type: string
  position: { x: number; y: number }
  size: { x: number; y: number }
  views: View[]
  divider: number
  active_view!: View
  locked?: boolean
  hovered_tab?: number
  a?: Node
  b?: Node
  [key: string]: any

  constructor(type?: string) {
    this.type = type || "leaf"
    this.position = { x: 0, y: 0 }
    this.size = { x: 0, y: 0 }
    this.views = []
    this.divider = 0.5
    if (this.type === "leaf") {
      this.add_view(new EmptyView())
    }
  }

  propagate(fn: string, ...args: any[]) {
    ;(this.a as any)[fn](...args)
    ;(this.b as any)[fn](...args)
  }

  on_mouse_moved(x: number, y: number, ...args: any[]) {
    this.hovered_tab = this.get_tab_overlapping_point(x, y) ?? undefined
    if (this.type === "leaf") {
      ;(this.active_view as any).on_mouse_moved(x, y, ...args)
    } else {
      this.propagate("on_mouse_moved", x, y, ...args)
    }
  }

  on_mouse_released(...args: any[]) {
    if (this.type === "leaf") {
      ;(this.active_view as any).on_mouse_released(...args)
    } else {
      this.propagate("on_mouse_released", ...args)
    }
  }

  consume(node: Node) {
    for (const k in this) {
      if (Object.prototype.hasOwnProperty.call(this, k)) {
        delete (this as any)[k]
      }
    }
    for (const k in node) {
      if (Object.prototype.hasOwnProperty.call(node, k)) {
        ;(this as any)[k] = (node as any)[k]
      }
    }
  }

  split(dir: string, view?: View, locked?: boolean): Node {
    if (this.type !== "leaf") throw new Error("Tried to split non-leaf node")
    const type = type_map[dir]
    if (!type) throw new Error("Invalid direction")
    const core = __get_core()
    const last_active = core.active_view
    const child = new Node()
    child.consume(this)
    this.consume(new Node(type))
    this.a = child
    this.b = new Node()
    if (view) this.b.add_view(view)
    if (locked) {
      this.b.locked = locked
      core.set_active_view(last_active)
    }
    if (dir === "up" || dir === "left") {
      ;[this.a, this.b] = [this.b, this.a]
    }
    return child
  }

  close_active_view(root: Node) {
    const do_close = () => {
      if (this.views.length > 1) {
        const idx = this.get_view_idx(this.active_view)!
        this.views.splice(idx, 1)
        this.set_active_view(this.views[idx - 1] || this.views[this.views.length - 1])
      } else {
        const parent = this.get_parent_node(root)!
        const is_a = (parent.a === this)
        const other = parent[is_a ? "b" : "a"] as Node
        if (other.get_locked_size()) {
          this.views = []
          this.add_view(new EmptyView())
        } else {
          parent.consume(other)
          let p = parent
          while (p.type !== "leaf") {
            p = (p[is_a ? "a" : "b"] as Node)
          }
          p.set_active_view(p.active_view)
        }
      }
      __get_core().last_active_view = undefined
    }
    this.active_view.try_close(do_close)
  }

  add_view(view: View) {
    if (this.type !== "leaf") throw new Error("Tried to add view to non-leaf node")
    if (this.locked) throw new Error("Tried to add view to locked node")
    if (this.views.length > 0 && this.views[0] instanceof EmptyView) {
      this.views.shift()
    }
    this.views.push(view)
    this.set_active_view(view)
  }

  set_active_view(view: View) {
    if (this.type !== "leaf") throw new Error("Tried to set active view on non-leaf node")
    this.active_view = view
    __get_core().set_active_view(view)
  }

  get_view_idx(view: View): number | undefined {
    const idx = this.views.indexOf(view)
    return idx >= 0 ? idx + 1 : undefined
  }

  get_node_for_view(view: View): Node | undefined {
    for (const v of this.views) {
      if (v === view) return this
    }
    if (this.type !== "leaf") {
      return this.a!.get_node_for_view(view) || this.b!.get_node_for_view(view)
    }
    return undefined
  }

  get_parent_node(root: Node): Node | undefined {
    if (root.a === this || root.b === this) {
      return root
    } else if (root.type !== "leaf") {
      return this.get_parent_node(root.a!) || this.get_parent_node(root.b!)
    }
    return undefined
  }

  get_children(t: View[] = []): View[] {
    for (const view of this.views) {
      t.push(view)
    }
    if (this.a) this.a.get_children(t)
    if (this.b) this.b.get_children(t)
    return t
  }

  get_divider_overlapping_point(px: number, py: number): Node | undefined {
    if (this.type !== "leaf") {
      const p = 6
      const [x, y, w, h] = this.get_divider_rect()!
      if (px > x - p && py > y - p && px < x + w + p && py < y + h + p) {
        return this
      }
      return this.a!.get_divider_overlapping_point(px, py)
          || this.b!.get_divider_overlapping_point(px, py)
    }
    return undefined
  }

  get_tab_overlapping_point(px: number, py: number): number | null {
    if (this.views.length === 1) return null
    const [x, y, w, h] = this.get_tab_rect(1)
    if (px >= x && py >= y && px < x + w * this.views.length && py < y + h) {
      return Math.floor((px - x) / w) + 1
    }
    return null
  }

  get_child_overlapping_point(x: number, y: number): Node {
    let child: Node
    if (this.type === "leaf") {
      return this
    } else if (this.type === "hsplit") {
      child = (x < this.b!.position.x) ? this.a! : this.b!
    } else {
      child = (y < this.b!.position.y) ? this.a! : this.b!
    }
    return child.get_child_overlapping_point(x, y)
  }

  get_tab_rect(idx: number): [number, number, number, number] {
    const tw = Math.min(style.tab_width, Math.ceil(this.size.x / this.views.length))
    const h = (style.font as any).get_height() + style.padding.y * 2
    return [this.position.x + (idx - 1) * tw, this.position.y, tw, h]
  }

  get_divider_rect(): [number, number, number, number] | undefined {
    const x = this.position.x
    const y = this.position.y
    if (this.type === "hsplit") {
      return [x + this.a!.size.x, y, style.divider_size, this.size.y]
    } else if (this.type === "vsplit") {
      return [x, y + this.a!.size.y, this.size.x, style.divider_size]
    }
    return undefined
  }

  get_locked_size(): [number, number] | undefined {
    if (this.type === "leaf") {
      if (this.locked) {
        const size = this.active_view.size
        return [size.x, size.y]
      }
    } else {
      const r1 = this.a!.get_locked_size()
      const r2 = this.b!.get_locked_size()
      if (r1 && r2) {
        const [x1, y1] = r1
        const [x2, y2] = r2
        const dsx = (x1 < 1 || x2 < 1) ? 0 : style.divider_size
        const dsy = (y1 < 1 || y2 < 1) ? 0 : style.divider_size
        return [x1 + x2 + dsx, y1 + y2 + dsy]
      }
    }
    return undefined
  }

  update_layout() {
    if (this.type === "leaf") {
      const av = this.active_view
      if (this.views.length > 1) {
        const [, , , th] = this.get_tab_rect(1)
        av.position.x = this.position.x
        av.position.y = this.position.y + th
        av.size.x = this.size.x
        av.size.y = this.size.y - th
      } else {
        copy_position_and_size(av, this)
      }
    } else {
      const r1 = this.a!.get_locked_size()
      const r2 = this.b!.get_locked_size()
      const x1 = r1 ? r1[0] : undefined
      const y1 = r1 ? r1[1] : undefined
      const x2 = r2 ? r2[0] : undefined
      const y2 = r2 ? r2[1] : undefined
      if (this.type === "hsplit") {
        calc_split_sizes(this, "x", "y", x1, x2)
      } else if (this.type === "vsplit") {
        calc_split_sizes(this, "y", "x", y1, y2)
      }
      this.a!.update_layout()
      this.b!.update_layout()
    }
  }

  update() {
    if (this.type === "leaf") {
      for (const view of this.views) {
        view.update()
      }
    } else {
      this.a!.update()
      this.b!.update()
    }
  }

  draw_tabs() {
    const [x, y, , h] = this.get_tab_rect(1)
    const ds = style.divider_size
    __get_core().push_clip_rect(x, y, this.size.x, h)
    renderer.draw_rect(x, y, this.size.x, h, style.background2)
    renderer.draw_rect(x, y + h - ds, this.size.x, ds, style.divider)

    for (let i = 0; i < this.views.length; i++) {
      const view = this.views[i]
      const [tx, ty, tw, th] = this.get_tab_rect(i + 1)
      const text = view.get_name()
      let color: any = style.dim
      if (view === this.active_view) {
        color = style.text
        renderer.draw_rect(tx, ty, tw, th, style.background)
        renderer.draw_rect(tx + tw, ty, ds, th, style.divider)
        renderer.draw_rect(tx - ds, ty, ds, th, style.divider)
      }
      if (i + 1 === this.hovered_tab) {
        color = style.text
      }
      __get_core().push_clip_rect(tx, ty, tw, th)
      const cx = tx + style.padding.x
      const cw = tw - style.padding.x * 2
      const align = (style.font as any).get_width(text) > cw ? "left" : "center"
      common.draw_text(style.font as any, color, text, align, cx, ty, cw, th)
      __get_core().pop_clip_rect()
    }

    __get_core().pop_clip_rect()
  }

  draw() {
    if (this.type === "leaf") {
      if (this.views.length > 1) {
        this.draw_tabs()
      }
      const pos = this.active_view.position
      const size = this.active_view.size
      __get_core().push_clip_rect(pos.x, pos.y, size.x + pos.x % 1, size.y + pos.y % 1)
      this.active_view.draw()
      __get_core().pop_clip_rect()
    } else {
      const [x, y, w, h] = this.get_divider_rect()!
      renderer.draw_rect(x, y, w, h, style.divider)
      this.propagate("draw")
    }
  }
}

class RootView extends View {
  root_node: Node
  deferred_draws: Array<{ fn: (...args: any[]) => void; [k: number]: any }>
  mouse: { x: number; y: number }
  dragged_divider?: Node

  constructor() {
    super()
    this.root_node = new Node()
    this.deferred_draws = []
    this.mouse = { x: 0, y: 0 }
  }

  defer_draw(fn: (...args: any[]) => void, ...args: any[]) {
    this.deferred_draws.unshift({ fn, ...args } as any)
  }

  get_active_node(): Node {
    return this.root_node.get_node_for_view(__get_core().active_view)!
  }

  open_doc(doc: Doc): DocView {
    let node = this.get_active_node()
    if (node.locked && __get_core().last_active_view) {
      __get_core().set_active_view(__get_core().last_active_view!)
      node = this.get_active_node()
    }
    if (node.locked) throw new Error("Cannot open doc on locked node")
    for (let i = 0; i < node.views.length; i++) {
      const view = node.views[i] as DocView
      if (view.doc === doc) {
        node.set_active_view(node.views[i])
        return view
      }
    }
    const view = new DocView(doc)
    node.add_view(view)
    this.root_node.update_layout()
    view.scroll_to_line(view.doc.get_selection()[0], true, true)
    return view
  }

  on_mouse_pressed(button: string, x: number, y: number, clicks: number): boolean {
    const div = this.root_node.get_divider_overlapping_point(x, y)
    if (div) {
      this.dragged_divider = div
      return true
    }
    const node = this.root_node.get_child_overlapping_point(x, y)
    const idx = node.get_tab_overlapping_point(x, y)
    if (idx !== null) {
      node.set_active_view(node.views[idx - 1])
      if (button === "middle") {
        node.close_active_view(this.root_node)
      }
    } else {
      __get_core().set_active_view(node.active_view)
      node.active_view.on_mouse_pressed(button, x, y, clicks)
    }
    return false
  }

  on_mouse_released(...args: any[]) {
    if (this.dragged_divider) {
      this.dragged_divider = undefined
    }
    this.root_node.on_mouse_released(...args)
  }

  on_mouse_moved(x: number, y: number, dx: number, dy: number) {
    if (this.dragged_divider) {
      const node = this.dragged_divider
      if (node.type === "hsplit") {
        node.divider = node.divider + dx / node.size.x
      } else {
        node.divider = node.divider + dy / node.size.y
      }
      node.divider = common.clamp(node.divider, 0.01, 0.99)
      return
    }

    this.mouse.x = x
    this.mouse.y = y
    this.root_node.on_mouse_moved(x, y, dx, dy)

    const node = this.root_node.get_child_overlapping_point(x, y)
    const div = this.root_node.get_divider_overlapping_point(x, y)
    if (div) {
      system.set_cursor(div.type === "hsplit" ? "sizeh" : "sizev")
    } else if (node.get_tab_overlapping_point(x, y)) {
      system.set_cursor("arrow")
    } else {
      system.set_cursor(node.active_view.cursor)
    }
  }

  on_mouse_wheel(...args: any[]) {
    const x = this.mouse.x
    const y = this.mouse.y
    const node = this.root_node.get_child_overlapping_point(x, y)
    node.active_view.on_mouse_wheel(args[0])
  }

  on_text_input(text: string) {
    __get_core().active_view.on_text_input(text)
  }

  update() {
    copy_position_and_size(this.root_node, this)
    this.root_node.update()
    this.root_node.update_layout()
  }

  draw() {
    this.root_node.draw()
    while (this.deferred_draws.length > 0) {
      const t = this.deferred_draws.pop()!
      const args: any[] = []
      for (let i = 0; i in t; i++) {
        args.push(t[i])
      }
      t.fn(...args)
    }
  }
}

export { RootView, Node, EmptyView }
export default RootView
