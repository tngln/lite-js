import common from "./common"
import * as renderer_font from "../../api/renderer_font"
import { G } from "../../G"

type RenFont = import("../../platform/renderer").RenFont
type RenColor = import("../../platform/renderer").RenColor

const SCALE = G["SCALE"] as number || 1
const EXEDIR = G["EXEDIR"] as string || "/"

type StyleColor = [number, number, number, number]

let style: {
  padding: { x: number; y: number }
  divider_size: number
  scrollbar_size: number
  caret_width: number
  tab_width: number
  font: RenFont
  big_font: RenFont
  icon_font: RenFont
  code_font: RenFont
  background: StyleColor
  background2: StyleColor
  background3: StyleColor
  text: StyleColor
  caret: StyleColor
  accent: StyleColor
  dim: StyleColor
  divider: StyleColor
  selection: StyleColor
  line_number: StyleColor
  line_number2: StyleColor
  line_highlight: StyleColor
  scrollbar: StyleColor
  scrollbar2: StyleColor
  syntax: Record<string, StyleColor>
  [key: string]: any
}

style = {
  padding: { x: common.round(14 * SCALE), y: common.round(7 * SCALE) },
  divider_size: common.round(1 * SCALE),
  scrollbar_size: common.round(4 * SCALE),
  caret_width: common.round(2 * SCALE),
  tab_width: common.round(170 * SCALE),

  font: renderer_font.load(EXEDIR + "/data/fonts/font.ttf", 14 * SCALE),
  big_font: renderer_font.load(EXEDIR + "/data/fonts/font.ttf", 34 * SCALE),
  icon_font: renderer_font.load(EXEDIR + "/data/fonts/icons.ttf", 14 * SCALE),
  code_font: renderer_font.load(EXEDIR + "/data/fonts/monospace.ttf", 13.5 * SCALE),

  background: common.color("#2e2e32") as StyleColor,
  background2: common.color("#252529") as StyleColor,
  background3: common.color("#252529") as StyleColor,
  text: common.color("#97979c") as StyleColor,
  caret: common.color("#93DDFA") as StyleColor,
  accent: common.color("#e1e1e6") as StyleColor,
  dim: common.color("#525257") as StyleColor,
  divider: common.color("#202024") as StyleColor,
  selection: common.color("#48484f") as StyleColor,
  line_number: common.color("#525259") as StyleColor,
  line_number2: common.color("#83838f") as StyleColor,
  line_highlight: common.color("#343438") as StyleColor,
  scrollbar: common.color("#414146") as StyleColor,
  scrollbar2: common.color("#4b4b52") as StyleColor,

  syntax: {
    "normal":   common.color("#e1e1e6") as StyleColor,
    "symbol":   common.color("#e1e1e6") as StyleColor,
    "comment":  common.color("#676b6f") as StyleColor,
    "keyword":  common.color("#E58AC9") as StyleColor,
    "keyword2": common.color("#F77483") as StyleColor,
    "number":   common.color("#FFA94D") as StyleColor,
    "literal":  common.color("#FFA94D") as StyleColor,
    "string":   common.color("#f7c95c") as StyleColor,
    "operator": common.color("#93DDFA") as StyleColor,
    "function": common.color("#93DDFA") as StyleColor,
  },
}

export type { StyleColor }
export { style }
export default style
