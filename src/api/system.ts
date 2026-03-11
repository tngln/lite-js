import { rencache_invalidate } from "../platform/rencache"
import { ren_get_size } from "../platform/renderer"
import { fs_absolute_path, fs_chdir, fs_get_file_info, fs_list_dir } from "../platform/filesystem"

type SystemEvent =
  | ["quit"]
  | ["resized", number, number]
  | ["exposed"]
  | ["filedropped", string, number, number]
  | ["keypressed", string]
  | ["keyreleased", string]
  | ["textinput", string]
  | ["mousepressed", string, number, number, number]
  | ["mousereleased", string, number, number]
  | ["mousemoved", number, number, number, number]
  | ["mousewheel", number]

let __canvas: HTMLCanvasElement | null = null
let __installed = false
let __is_fullscreen = false

const __event_queue: SystemEvent[] = []
const __waiters: Array<(ok: boolean) => void> = []

let __last_mouse_x = 0
let __last_mouse_y = 0

function __push_event(e: SystemEvent) {
  __event_queue.push(e)
  if (__waiters.length) {
    const waiters = __waiters.splice(0, __waiters.length)
    for (const resolve of waiters) resolve(true)
  }
}

function __mouse_pos(ev: MouseEvent | PointerEvent) {
  if (!__canvas) return { x: 0, y: 0 }
  const rect = __canvas.getBoundingClientRect()
  const x = ev.clientX - rect.left
  const y = ev.clientY - rect.top
  return { x: Math.floor(x), y: Math.floor(y) }
}

function __button_name(button: number) {
  switch (button) {
    case 0: return "left"
    case 1: return "middle"
    case 2: return "right"
    default: return "?"
  }
}

function __key_name(e: KeyboardEvent) {
  const k = e.key
  if (k === " ") return "space"
  if (k === "Enter") return "return"
  if (k === "Escape") return "escape"
  if (k === "Backspace") return "backspace"
  if (k === "Tab") return "tab"
  if (k === "Delete") return "delete"
  if (k === "Home") return "home"
  if (k === "End") return "end"
  if (k === "PageUp") return "pageup"
  if (k === "PageDown") return "pagedown"
  if (k === "Insert") return "insert"

  if (k === "ArrowLeft") return "left"
  if (k === "ArrowRight") return "right"
  if (k === "ArrowUp") return "up"
  if (k === "ArrowDown") return "down"

  if (k.length === 1) return k.toLowerCase()
  return k.toLowerCase()
}

function __ensure_text_input_target() {
  let el = document.getElementById("lite-text-input") as HTMLTextAreaElement | null
  if (el) return el
  el = document.createElement("textarea")
  el.id = "lite-text-input"
  el.autocapitalize = "off"
  el.autocomplete = "off"
  el.autocorrect = false
  el.spellcheck = false
  el.style.position = "absolute"
  el.style.left = "-1000px"
  el.style.top = "0"
  el.style.width = "1px"
  el.style.height = "1px"
  el.style.opacity = "0"
  document.body.appendChild(el)
  return el
}

function __install_listeners(canvas: HTMLCanvasElement) {
  if (__installed) return
  __installed = true
  __canvas = canvas

  const input = __ensure_text_input_target()
  const focus_input = () => {
    if (document.activeElement !== input) input.focus()
  }
  focus_input()

  const on_visibility = () => {
    if (!document.hidden) {
      rencache_invalidate()
      __push_event(["exposed"])
    }
  }
  document.addEventListener("visibilitychange", on_visibility)
  window.addEventListener("focus", on_visibility)

  const on_resized = () => {
    const [w, h] = ren_get_size()
    __push_event(["resized", w, h])
  }

  const ro = new ResizeObserver(on_resized)
  ro.observe(canvas)
  window.addEventListener("resize", on_resized)

  canvas.addEventListener("pointerdown", (e) => {
    focus_input()
    const { x, y } = __mouse_pos(e)
    __last_mouse_x = x
    __last_mouse_y = y
    if ((e as PointerEvent).pointerId !== undefined && e.button === 0) {
      canvas.setPointerCapture((e as PointerEvent).pointerId)
    }
    __push_event(["mousepressed", __button_name(e.button), x, y, 1])
  })

  canvas.addEventListener("pointerup", (e) => {
    const { x, y } = __mouse_pos(e)
    __last_mouse_x = x
    __last_mouse_y = y
    if ((e as PointerEvent).pointerId !== undefined && e.button === 0) {
      try { canvas.releasePointerCapture((e as PointerEvent).pointerId) } catch {}
    }
    __push_event(["mousereleased", __button_name(e.button), x, y])
  })

  canvas.addEventListener("pointermove", (e) => {
    const { x, y } = __mouse_pos(e)
    const dx = x - __last_mouse_x
    const dy = y - __last_mouse_y
    __last_mouse_x = x
    __last_mouse_y = y
    __push_event(["mousemoved", x, y, dx, dy])
  })

  canvas.addEventListener("wheel", (e) => {
    const delta = e.deltaY
    const y = delta > 0 ? -1 : delta < 0 ? 1 : 0
    if (y) __push_event(["mousewheel", y])
    e.preventDefault()
  }, { passive: false })

  canvas.addEventListener("dragover", (e) => {
    e.preventDefault()
  })
  canvas.addEventListener("drop", (e) => {
    e.preventDefault()
    if (!e.dataTransfer) return
    const { x, y } = __mouse_pos(e)
    const files = Array.from(e.dataTransfer.files)
    if (!files.length) return
    __push_event(["filedropped", files[0].name, x, y])
  })

  input.addEventListener("beforeinput", (e) => {
    const data = (e as InputEvent).data
    if (!data) return
    if ((e as InputEvent).inputType === "insertText") {
      __push_event(["textinput", data])
    }
  })

  window.addEventListener("keydown", (e) => {
    if (e.key === "Tab") e.preventDefault()
    __push_event(["keypressed", __key_name(e)])
  })

  window.addEventListener("keyup", (e) => {
    __push_event(["keyreleased", __key_name(e)])
  })
}

function f_init(canvas: HTMLCanvasElement) {
  __install_listeners(canvas)
}

function* f_poll_event() {
  while (__event_queue.length) {
    const e = __event_queue.shift()!
    yield e
  }
}

function f_wait_event(n: number) {
  if (__event_queue.length) return Promise.resolve(true)

  return new Promise<boolean>((resolve) => {
    const timer = window.setTimeout(() => {
      const idx = __waiters.indexOf(resolve)
      if (idx !== -1) __waiters.splice(idx, 1)
      resolve(false)
    }, Math.max(0, n * 1000))
    __waiters.push((ok) => {
      window.clearTimeout(timer)
      resolve(ok)
    })
  })
}

function f_set_cursor(cursor: string) {
  const el = __canvas ?? document.body
  if (cursor === "ibeam") { el.style.cursor = "text"; return }
  if (cursor === "sizeh") { el.style.cursor = "ew-resize"; return }
  if (cursor === "sizev") { el.style.cursor = "ns-resize"; return }
  if (cursor === "hand") { el.style.cursor = "pointer"; return }
  el.style.cursor = "default"
}

function f_set_window_title(title: string) {
  document.title = title
}

function f_set_window_mode(mode: string) {
  if (mode === "fullscreen") {
    if (!__is_fullscreen) {
      __is_fullscreen = true
      const el = __canvas ?? document.documentElement
      el.requestFullscreen?.().catch(() => {})
    }
    return
  }
  if (__is_fullscreen) {
    __is_fullscreen = false
    document.exitFullscreen?.().catch(() => {})
  }
}

function f_window_has_focus() {
  return !document.hidden && document.hasFocus()
}

function f_show_confirm_dialog(title: string, msg: string) {
  return window.confirm(`${title}\n\n${msg}`)
}

function f_chdir(path: string) {
  fs_chdir(path)
}

function f_list_dir(path: string) {
  return fs_list_dir(path)
}

function f_absolute_path(path: string) {
  return fs_absolute_path(path)
}

function f_get_file_info(path: string) {
  return fs_get_file_info(path)
}

async function f_get_clipboard() {
  try {
    return await navigator.clipboard.readText()
  } catch {
    return undefined
  }
}

async function f_set_clipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {}
}

function f_get_time() {
  return performance.now() / 1000
}

function f_sleep(n: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, n * 1000)))
}

function f_exec(_cmd: string) {}

function f_fuzzy_match(str: string, ptn: string) {
  let score = 0
  let run = 0

  let si = 0
  let pi = 0
  while (si < str.length && pi < ptn.length) {
    while (si < str.length && str[si] === " ") si++
    while (pi < ptn.length && ptn[pi] === " ") pi++
    if (si >= str.length || pi >= ptn.length) break

    const a = str[si]
    const b = ptn[pi]
    if (a.toLowerCase() === b.toLowerCase()) {
      score += run * 10 - (a !== b ? 1 : 0)
      run++
      pi++
    } else {
      score -= 10
      run = 0
    }
    si++
  }
  if (pi < ptn.length) return null
  return score - (str.length - si)
}

export type { SystemEvent }

export {
  f_init as init,
  f_poll_event as poll_event,
  f_wait_event as wait_event,
  f_set_cursor as set_cursor,
  f_set_window_title as set_window_title,
  f_set_window_mode as set_window_mode,
  f_window_has_focus as window_has_focus,
  f_show_confirm_dialog as show_confirm_dialog,
  f_chdir as chdir,
  f_list_dir as list_dir,
  f_absolute_path as absolute_path,
  f_get_file_info as get_file_info,
  f_get_clipboard as get_clipboard,
  f_set_clipboard as set_clipboard,
  f_get_time as get_time,
  f_sleep as sleep,
  f_exec as exec,
  f_fuzzy_match as fuzzy_match,
}

