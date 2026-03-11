import { type RenColor, type RenFont, ren_get_size } from "../platform/renderer"
import { rencache_begin_frame, rencache_draw_rect, rencache_draw_text, rencache_end_frame, rencache_set_clip_rect, rencache_show_debug } from "../platform/rencache"
import * as font from "./renderer_font"

type ColorArg =
  | [number, number, number, number?]
  | { r: number; g: number; b: number; a?: number }
  | null
  | undefined

function checkcolor(value: ColorArg, def: number): RenColor {
  if (!value) return { r: def, g: def, b: def, a: 255 }
  if (Array.isArray(value)) {
    const r = Number(value[0])
    const g = Number(value[1])
    const b = Number(value[2])
    const a = value.length >= 4 ? Number(value[3]) : 255
    return { r, g, b, a }
  }
  return { r: Number(value.r), g: Number(value.g), b: Number(value.b), a: value.a === undefined ? 255 : Number(value.a) }
}

function f_show_debug(enable: unknown) {
  rencache_show_debug(Boolean(enable))
}

function f_get_size() {
  return ren_get_size()
}

function f_begin_frame() {
  rencache_begin_frame()
}

function f_end_frame() {
  rencache_end_frame()
}

function f_set_clip_rect(x: number, y: number, width: number, height: number) {
  rencache_set_clip_rect({ x, y, width, height })
}

function f_draw_rect(x: number, y: number, width: number, height: number, color?: ColorArg) {
  rencache_draw_rect({ x, y, width, height }, checkcolor(color, 255))
}

function f_draw_text(font: RenFont, text: string, x: number, y: number, color?: ColorArg) {
  return rencache_draw_text(font, text, x, y, checkcolor(color, 255))
}

export type { ColorArg }

export { font }

export {
  f_show_debug as show_debug,
  f_get_size as get_size,
  f_begin_frame as begin_frame,
  f_end_frame as end_frame,
  f_set_clip_rect as set_clip_rect,
  f_draw_rect as draw_rect,
  f_draw_text as draw_text,
}

