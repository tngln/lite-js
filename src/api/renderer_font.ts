import { type RenFont, ren_get_font_height, ren_get_font_width, ren_load_font, ren_set_font_tab_width } from "../platform/renderer"
import { rencache_free_font } from "../platform/rencache"

function f_load(filename: string, size: number) {
  const self = ren_load_font(filename, size)
  if (!self) throw new Error("failed to load font")
  return self
}

function f_set_tab_width(self: RenFont, n: number) {
  ren_set_font_tab_width(self, n)
}

function f_get_width(self: RenFont, text: string) {
  return ren_get_font_width(self, text)
}

function f_get_height(self: RenFont) {
  return ren_get_font_height(self)
}

function f_gc(self: RenFont | null | undefined) {
  if (!self) return
  rencache_free_font(self)
}

export {
  f_gc as __gc,
  f_load as load,
  f_set_tab_width as set_tab_width,
  f_get_width as get_width,
  f_get_height as get_height,
}

