import { G } from "../../G"

let config = (() => {
  const SCALE = G["SCALE"] as number || 1

  const project_scan_rate = 5
  const fps = 60
  const max_log_items = 80
  const message_timeout = 3
  const mouse_wheel_scroll = 50 * SCALE
  const file_size_limit = 10
  const ignore_files = "^\\."
  const symbol_pattern = "[A-Za-z_][A-Za-z0-9_]*"
  const non_word_chars = " \t\n/\\()\"':,.;<>~!@#$%^&*|+=[]{}`?-"
  const undo_merge_timeout = 0.3
  const max_undos = 10000
  const highlight_current_line = true
  const line_height = 1.2
  const indent_size = 2
  const tab_type = "soft"
  const line_limit = 80

  return {
    project_scan_rate,
    fps,
    max_log_items,
    message_timeout,
    mouse_wheel_scroll,
    file_size_limit,
    ignore_files,
    symbol_pattern,
    non_word_chars,
    undo_merge_timeout,
    max_undos,
    highlight_current_line,
    line_height,
    indent_size,
    tab_type,
    line_limit,
  }
})()

export { config }
export default config
