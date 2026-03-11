
import { ren_get_size, ren_init, ren_load_font } from "./platform/renderer"
import { rencache_begin_frame, rencache_draw_rect, rencache_draw_text, rencache_end_frame, rencache_set_clip_rect, rencache_show_debug } from "./platform/rencache"
import { absolute_path, get_file_info, init as system_init, list_dir, poll_event, set_cursor, set_window_mode, set_window_title, wait_event, window_has_focus } from "./api/system"
import * as renderer_api from "./api/renderer"
import { createDebugOverlay, loadDebugSettings, saveDebugSettings, type DebugSettings } from "./debug"

function getAppElement() {
  const el = document.getElementById("app");
  if (!el) {
    throw new Error("Missing #app element");
  }
  return el;
}

function createCanvas() {
  const canvas = document.createElement("canvas");
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  return canvas;
}

function setupLayout(canvas: HTMLCanvasElement) {
  document.documentElement.style.margin = "0";
  document.documentElement.style.padding = "0";
  document.body.style.margin = "0";
  document.body.style.padding = "0";
  document.body.style.overflow = "hidden";

  const app = getAppElement();
  app.style.width = "100vw";
  app.style.height = "100vh";
  app.appendChild(canvas);
}

document.addEventListener("DOMContentLoaded", () => {
  let debug = loadDebugSettings()

  const canvas = createCanvas()
  setupLayout(canvas)

  ren_init(canvas)
  const font = ren_load_font("/data/fonts/monospace.ttf", 16)
  rencache_show_debug(debug.showDirtyDebugTint)
  system_init(canvas)
  set_window_title("lite-js")

  const lines = Array.from({ length: 400 }, (_, i) => `line ${i + 1}  lorem ipsum dolor sit amet, consectetur adipiscing elit.`)
  const eventLog: string[] = []
  let fullscreen = false
  let lastMouse: { x: number; y: number } | null = null
  let mouseWheel = 0

  const overlay = createDebugOverlay(debug, (next) => {
    debug = next
    saveDebugSettings(debug)
    overlay.apply(debug)
    rencache_show_debug(debug.showDirtyDebugTint)
  })
  document.body.appendChild(overlay.root)

  window.addEventListener("keydown", (e) => {
    if (e.key === "`") {
      const next = { ...debug, visible: !debug.visible }
      debug = next
      saveDebugSettings(debug)
      overlay.apply(debug)
      return
    }
    if (e.key === "F2") {
      const next = { ...debug, expanded: !debug.expanded, visible: true }
      debug = next
      saveDebugSettings(debug)
      overlay.apply(debug)
      return
    }
  })

  const apiStatusText = () => {
    const rows: string[] = []
    rows.push(`system.poll_event: ${typeof poll_event}`)
    rows.push(`system.wait_event: ${typeof wait_event}`)
    rows.push(`system.set_window_mode: ${typeof set_window_mode}`)
    rows.push(`renderer_api.draw_text: ${typeof (renderer_api as any).draw_text}`)
    rows.push(`renderer_api.font.load: ${typeof (renderer_api as any).font?.load}`)
    return rows.join("\n")
  }

  function frame(t: number) {
    const [w, h] = ren_get_size()

    for (const ev of poll_event()) {
      if (ev[0] === "keypressed" && ev[1] === "f11") {
        fullscreen = !fullscreen
        set_window_mode(fullscreen ? "fullscreen" : "normal")
      }
      if (ev[0] === "keypressed" && ev[1] === "escape") {
        fullscreen = false
        set_window_mode("normal")
      }
      if (ev[0] === "mousemoved") {
        lastMouse = { x: ev[1], y: ev[2] }
      } else if (ev[0] === "mousepressed" || ev[0] === "mousereleased") {
        lastMouse = { x: ev[2], y: ev[3] }
      } else if (ev[0] === "mousewheel") {
        mouseWheel += ev[1]
      }
      if (debug.showEventLog) {
        eventLog.unshift(JSON.stringify(ev))
        if (eventLog.length > 12) eventLog.pop()
      }
    }

    rencache_begin_frame()
    rencache_set_clip_rect({ x: 0, y: 0, width: w, height: h })

    rencache_draw_rect({ x: 0, y: 0, width: w, height: h }, { r: 22, g: 24, b: 28, a: 255 })
    if (debug.showScene) {
      rencache_draw_text(font, "scene demo", 20, 20, { r: 235, g: 235, b: 235, a: 255 })
    }

    const x = 20 + Math.floor(((Math.sin(t / 700) + 1) * 0.5) * Math.max(0, w - 80))
    const y = 60 + Math.floor(((Math.cos(t / 900) + 1) * 0.5) * Math.max(0, h - 140))
    if (debug.showScene) {
      rencache_draw_rect({ x, y, width: 60, height: 30 }, { r: 255, g: 120, b: 50, a: 255 })
    }

    if (debug.enableCursorHover && lastMouse && debug.showScene) {
      const over = lastMouse.x >= x && lastMouse.x <= x + 60 && lastMouse.y >= y && lastMouse.y <= y + 30
      set_cursor(over ? "hand" : "arrow")
    }

    if (debug.showCanvasText) {
      const lineHeight = 18
      const startY = 110
      for (let i = 0; i < lines.length; i++) {
        const ly = startY + i * lineHeight
        if (ly > h - 10) break
        rencache_draw_text(font, lines[i], 20, ly, { r: 180, g: 190, b: 210, a: 255 })
      }
    }

    rencache_end_frame()

    if (debug.visible) {
      const statusLines: string[] = []
      if (debug.showStatus) {
        statusLines.push(`size: ${w}x${h}`)
        statusLines.push(`focus: ${window_has_focus()}`)
        statusLines.push(`fullscreen: ${fullscreen}`)
        statusLines.push(`mouse: ${lastMouse ? `${lastMouse.x},${lastMouse.y}` : "-"}`)
        statusLines.push(`wheel: ${mouseWheel}`)
        statusLines.push(`cwd: ${absolute_path(".")}`)
      }
      if (debug.showFilesystem) {
        statusLines.push(`list_dir(/): ${(list_dir("/") ?? []).join(", ")}`)
        statusLines.push(`get_file_info(/README.md): ${JSON.stringify(get_file_info("/README.md"))}`)
      }
      if (debug.showApiStatus) {
        statusLines.push(apiStatusText())
      }
      overlay.update({ statusText: statusLines.join("\n"), eventLines: debug.showEventLog ? eventLog : [] })
    }
  
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);

})
