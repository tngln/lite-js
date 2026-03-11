import * as renderer from "./renderer"
import * as system from "./system"

const API_TYPE_FONT = "Font"

const libs = {
  system,
  renderer,
} as const

function api_load_libs() {
  return libs
}

export { API_TYPE_FONT, api_load_libs, libs, renderer, system }

