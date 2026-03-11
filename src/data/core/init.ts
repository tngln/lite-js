import common from "./common"
import config from "./config"
import style from "./style"
import command from "./command"
import keymap from "./keymap"
import { RootView } from "./rootview"
import { StatusView } from "./statusview"
import { CommandView } from "./commandview"
import { Doc } from "./doc/init"
import * as renderer from "../../api/renderer"
import * as system from "../../api/system"
import { G } from "../../G"

// Import command modules to register them as a side effect
import "./commands/core"
import "./commands/root"
import "./commands/command"
import "./commands/doc"
import "./commands/findreplace"

type LogItem = {
  text: string
  time: number
  at: string
  info?: string
}

type ProjectFile = {
  filename: string
  modified: number
  size: number
  type: "file" | "dir" | null
}

type Thread = {
  gen: Generator<number | undefined, void, unknown>
  wake: number
}

export type Core = {
  frame_start: number
  clip_rect_stack: [number, number, number, number][]
  log_items: LogItem[]
  docs: Doc[]
  threads: Map<any, Thread>
  project_files: ProjectFile[]
  redraw: boolean
  root_view: RootView
  command_view: CommandView
  status_view: StatusView
  active_view: any
  last_active_view?: any
  window_title?: string
  EXEDIR?: string

  init: () => void
  run: () => void
  step: () => boolean
  quit: (force?: boolean) => void
  log: (fmt: string, ...args: any[]) => LogItem
  log_quiet: (fmt: string, ...args: any[]) => LogItem
  error: (fmt: string, ...args: any[]) => LogItem
  try: <T>(fn: (...args: any[]) => T, ...args: any[]) => [boolean, T | undefined]
  set_active_view: (view: any) => void
  add_thread: (f: () => Generator<number | undefined, void, unknown>, weak_ref?: any) => void
  push_clip_rect: (x: number, y: number, w: number, h: number) => void
  pop_clip_rect: () => void
  open_doc: (filename?: string) => Doc
  get_views_referencing_doc: (doc: Doc) => any[]
  reload_module: (name: string) => void
  load_plugins: () => boolean
  load_project_module: () => boolean
  on_event: (type: string, ...args: any[]) => boolean
  on_error: (err: unknown) => void
}

function __format(fmt: string, ...args: any[]): string {
  let i = 0
  return fmt.replace(/%[sqd%]/g, (m) => {
    if (m === "%%") return "%"
    const arg = args[i++]
    if (m === "%q") return JSON.stringify(String(arg))
    if (m === "%d") return String(Math.floor(Number(arg)))
    return String(arg)
  })
}

function __project_scan_thread(core: Core): () => Generator<number | undefined, void, unknown> {
  function diff_files(a: ProjectFile[], b: ProjectFile[]) {
    if (a.length !== b.length) return true
    for (let i = 0; i < a.length; i++) {
      if (b[i].filename !== a[i].filename || b[i].modified !== a[i].modified) {
        return true
      }
    }
    return false
  }

  function compare_file(a: ProjectFile, b: ProjectFile) {
    return a.filename < b.filename ? -1 : a.filename > b.filename ? 1 : 0
  }

  function* get_files(path: string, t: ProjectFile[] = []): Generator<undefined, ProjectFile[], unknown> {
    yield undefined
    const size_limit = config.file_size_limit * 10e5
    const all = system.list_dir(path) || []
    const dirs: ProjectFile[] = []
    const files: ProjectFile[] = []

    for (let i = 1; i <= all.length - 1; i++) {
      const file = all[i]
      if (!new RegExp(config.ignore_files).test(file)) {
        const fullpath = (path !== "." && path + "/" || "") + file
        const info = system.get_file_info(fullpath)
        if (info && info.size < size_limit) {
          const pf: ProjectFile = { filename: fullpath, modified: info.modified, size: info.size, type: info.type }
          if (info.type === "dir") dirs.push(pf)
          else files.push(pf)
        }
      }
    }

    dirs.sort(compare_file)
    for (const f of dirs) {
      t.push(f)
      yield* get_files(f.filename, t)
    }

    files.sort(compare_file)
    for (const f of files) {
      t.push(f)
    }

    return t
  }

  return function*() {
    while (true) {
      // get project files and replace previous table if the new table is different
      const gen = get_files(".")
      let result = gen.next()
      while (!result.done) {
        yield result.value
        result = gen.next()
      }
      const t = result.value as ProjectFile[]
      if (diff_files(core.project_files, t)) {
        core.project_files = t
        core.redraw = true
      }

      // wait for next scan
      yield config.project_scan_rate
    }
  }
}

function __log(core: Core, icon: string | null, icon_color: any, fmt: string, ...args: any[]): LogItem {
  const text = __format(fmt, ...args)
  if (icon && core.status_view) {
    core.status_view.show_message(icon, icon_color, text)
  }

  const at = "core"
  const item: LogItem = { text, time: Date.now() / 1000, at }
  core.log_items.push(item)
  if (core.log_items.length > config.max_log_items) {
    core.log_items.shift()
  }
  return item
}

function create_core(): Core {
  const core: Core = {} as Core

  // expose globally for circular dep resolution
  ;(globalThis as any).__lite_core = core

  core.frame_start = 0
  core.clip_rect_stack = [[0, 0, 0, 0]]
  core.log_items = []
  core.docs = []
  core.threads = new Map()
  core.project_files = []
  core.redraw = true
  core.EXEDIR = G["EXEDIR"] as string || "/"

  core.log = function(fmt: string, ...args: any[]) {
    return __log(core, "i", style.text, fmt, ...args)
  }

  core.log_quiet = function(fmt: string, ...args: any[]) {
    return __log(core, null, null, fmt, ...args)
  }

  core.error = function(fmt: string, ...args: any[]) {
    return __log(core, "!", style.accent, fmt, ...args)
  }

  core.try = function<T>(fn: (...args: any[]) => T, ...args: any[]): [boolean, T | undefined] {
    try {
      const res = fn(...args)
      return [true, res]
    } catch (e: any) {
      const item = core.error("%s", e?.message || String(e))
      item.info = e?.stack || ""
      return [false, undefined]
    }
  }

  core.set_active_view = function(view: any) {
    if (!view) throw new Error("Tried to set active view to nil")
    if (view !== core.active_view) {
      core.last_active_view = core.active_view
      core.active_view = view
    }
  }

  core.add_thread = function(f: () => Generator<number | undefined, void, unknown>, weak_ref?: any) {
    const key = weak_ref !== undefined ? weak_ref : Symbol()
    const gen = f()
    core.threads.set(key, { gen, wake: 0 })
  }

  core.push_clip_rect = function(x: number, y: number, w: number, h: number) {
    const last = core.clip_rect_stack[core.clip_rect_stack.length - 1]
    const [x2, y2, w2, h2] = last
    const r = x + w
    const b = y + h
    const r2 = x2 + w2
    const b2 = y2 + h2
    const nx = Math.max(x, x2)
    const ny = Math.max(y, y2)
    const nb = Math.min(b, b2)
    const nr = Math.min(r, r2)
    const nw = nr - nx
    const nh = nb - ny
    core.clip_rect_stack.push([nx, ny, nw, nh])
    renderer.set_clip_rect(nx, ny, nw, nh)
  }

  core.pop_clip_rect = function() {
    core.clip_rect_stack.pop()
    const last = core.clip_rect_stack[core.clip_rect_stack.length - 1]
    renderer.set_clip_rect(last[0], last[1], last[2], last[3])
  }

  core.open_doc = function(filename?: string): Doc {
    if (filename) {
      // try to find existing doc for filename
      const abs_filename = system.absolute_path(filename)
      for (const doc of core.docs) {
        if (doc.filename && abs_filename === system.absolute_path(doc.filename)) {
          return doc
        }
      }
    }
    // no existing doc for filename; create new
    const doc = new Doc(filename)
    core.docs.push(doc)
    core.log_quiet(filename ? 'Opened doc "%s"' : "Opened new doc", filename)
    return doc
  }

  core.get_views_referencing_doc = function(doc: Doc): any[] {
    const res: any[] = []
    const views = core.root_view.root_node.get_children()
    for (const view of views) {
      if ((view as any).doc === doc) res.push(view)
    }
    return res
  }

  core.reload_module = function(name: string) {
    core.log_quiet("reload_module not supported in browser: %s", name)
  }

  core.load_plugins = function(): boolean {
    // In browser context, plugins are not loaded from filesystem
    return true
  }

  core.load_project_module = function(): boolean {
    // In browser context, project modules are not loaded
    return true
  }

  core.quit = function(force?: boolean) {
    if (force) {
      // In browser context, we can't exit; just reload
      window.location.reload()
      return
    }
    let dirty_count = 0
    let dirty_name = ""
    for (const doc of core.docs) {
      if (doc.is_dirty()) {
        dirty_count++
        dirty_name = doc.get_name()
      }
    }
    if (dirty_count > 0) {
      let text: string
      if (dirty_count === 1) {
        text = `"${dirty_name}" has unsaved changes. Quit anyway?`
      } else {
        text = `${dirty_count} docs have unsaved changes. Quit anyway?`
      }
      const confirm = system.show_confirm_dialog("Unsaved Changes", text)
      if (!confirm) return
    }
    core.quit(true)
  }

  core.init = function() {
    const project_dir = core.EXEDIR || "/"
    const files: string[] = []
    const ARGS = G["ARGS"] as string[] || []
    for (let i = 2; i < ARGS.length; i++) {
      const info = system.get_file_info(ARGS[i]) || {}
      if ((info as any).type === "file") {
        files.push(system.absolute_path(ARGS[i]))
      } else if ((info as any).type === "dir") {
        // project_dir = ARGS[i]
      }
    }

    try { system.chdir(project_dir) } catch {}

    core.frame_start = 0
    core.clip_rect_stack = [[0, 0, 0, 0]]
    core.log_items = []
    core.docs = []
    core.threads = new Map()
    core.project_files = []
    core.redraw = true

    core.root_view = new RootView()
    core.command_view = new CommandView()
    core.status_view = new StatusView()

    core.root_view.root_node.split("down", core.command_view, true as any)
    core.root_view.root_node.b!.split("down", core.status_view, true as any)

    core.set_active_view(core.root_view.root_node.a!.active_view)

    core.add_thread(__project_scan_thread(core))
    command.add_defaults()

    for (const filename of files) {
      core.root_view.open_doc(core.open_doc(filename))
    }
  }

  core.on_error = function(err: unknown) {
    console.error("lite error:", err)
  }

  core.step = function(): boolean {
    // handle events
    let did_keymap = false
    let mouse_moved = false
    const mouse = { x: 0, y: 0, dx: 0, dy: 0 }

    for (const ev of system.poll_event()) {
      if (ev[0] === "mousemoved") {
        mouse_moved = true
        mouse.x = ev[1] as number
        mouse.y = ev[2] as number
        mouse.dx += ev[3] as number
        mouse.dy += ev[4] as number
      } else if (ev[0] === "textinput" && did_keymap) {
        did_keymap = false
      } else {
        const [, res] = core.try(core.on_event as any, ev[0], ...ev.slice(1))
        did_keymap = Boolean(res) || did_keymap
      }
      core.redraw = true
    }
    if (mouse_moved) {
      core.try(core.on_event as any, "mousemoved", mouse.x, mouse.y, mouse.dx, mouse.dy)
    }

    const [width, height] = renderer.get_size()

    // update
    core.root_view.size.x = width
    core.root_view.size.y = height
    core.root_view.update()
    if (!core.redraw) return false
    core.redraw = false

    // close unreferenced docs
    for (let i = core.docs.length - 1; i >= 0; i--) {
      const doc = core.docs[i]
      if (core.get_views_referencing_doc(doc).length === 0) {
        core.docs.splice(i, 1)
        core.log_quiet('Closed doc "%s"', doc.get_name())
      }
    }

    // update window title
    const name = core.active_view?.get_name?.() || "---"
    const title = (name !== "---") ? (name + " - lite") : "lite"
    if (title !== core.window_title) {
      system.set_window_title(title)
      core.window_title = title
    }

    // draw
    renderer.begin_frame()
    core.clip_rect_stack[0] = [0, 0, width, height]
    renderer.set_clip_rect(0, 0, width, height)
    core.root_view.draw()
    renderer.end_frame()
    return true
  }

  core.on_event = function(type: string, ...args: any[]): boolean {
    let did_keymap = false
    if (type === "textinput") {
      core.root_view.on_text_input(args[0])
    } else if (type === "keypressed") {
      did_keymap = keymap.on_key_pressed(args[0])
    } else if (type === "keyreleased") {
      keymap.on_key_released(args[0])
    } else if (type === "mousemoved") {
      core.root_view.on_mouse_moved(args[0], args[1], args[2], args[3])
    } else if (type === "mousepressed") {
      core.root_view.on_mouse_pressed(args[0], args[1], args[2], args[3])
    } else if (type === "mousereleased") {
      core.root_view.on_mouse_released(args[0], args[1], args[2])
    } else if (type === "mousewheel") {
      core.root_view.on_mouse_wheel(args[0])
    } else if (type === "filedropped") {
      const [filename, mx, my] = args
      const info = system.get_file_info(filename)
      if (info && info.type === "dir") {
        // Can't open new window in browser; just log
        core.log("Dropped directory: %s", filename)
      } else {
        const [ok, doc] = core.try(core.open_doc, filename)
        if (ok && doc) {
          const node = core.root_view.root_node.get_child_overlapping_point(mx, my)
          node.set_active_view(node.active_view)
          core.root_view.open_doc(doc)
        }
      }
    } else if (type === "quit") {
      core.quit()
    }
    return did_keymap
  }

  core.run = function() {
    // In browser context, the run loop is driven by requestAnimationFrame
    // This is handled by main.ts
    throw new Error("core.run() should not be called directly in browser context")
  }

  return core
}

const core = create_core()

export type { LogItem, ProjectFile }
export { core }
export default core
