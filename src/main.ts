
import { ren_init } from "./platform/renderer"
import { init as system_init } from "./api/system"
import { core } from "./data/core/init"
import * as renderer from "./api/renderer"
import * as system from "./api/system"

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
  const canvas = createCanvas()
  setupLayout(canvas)

  ren_init(canvas)
  system_init(canvas)

  core.init()

  let __thread_gen: Generator<undefined, void, unknown> | null = null

  function __run_threads() {
    const max_time = 1 / 60 - 0.004
    let ran_any = false
    const now = system.get_time()

    for (const [key, thread] of core.threads) {
      if (thread.wake < now) {
        const result = thread.gen.next()
        if (result.done) {
          core.threads.delete(key)
        } else if (typeof result.value === "number") {
          thread.wake = now + result.value
        }
        ran_any = true
      }

      if (system.get_time() - core.frame_start > max_time) {
        break
      }
    }

    return ran_any
  }

  function frame(_t: number) {
    core.frame_start = system.get_time()
    core.step()
    __run_threads()
    requestAnimationFrame(frame)
  }

  requestAnimationFrame(frame)
})

