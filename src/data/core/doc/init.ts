import { Highlighter } from "./highlighter"
import syntax from "../syntax"
import type { Syntax } from "../tokenizer"
import config from "../config"
import common from "../common"
import * as system from "../../../api/system"

type DocPosition = { line: number; col: number }
type Selection = { a: DocPosition; b: DocPosition }
type UndoCmd = { type: string; time: number; [k: number]: any }
type UndoStack = { idx: number; [k: number]: UndoCmd | undefined }

// Note: lines is 1-based (index 0 is undefined placeholder)
// #lines equivalent is lines.length - 1

function split_lines(text: string): string[] {
  const res: string[] = [undefined as any]
  const parts = (text + "\n").match(/([\s\S]*?)\n/g)
  if (parts) {
    for (const part of parts) {
      res.push(part.slice(0, -1))
    }
  }
  return res
}

function splice(t: any[], at: number, remove: number, insert: any[] = []) {
  // at is 1-based
  const offset = insert.length - remove
  const old_len = t.length - 1 // real length (1-based)
  if (offset < 0) {
    for (let i = at - offset; i <= old_len - offset; i++) {
      t[i + offset] = t[i]
    }
  } else if (offset > 0) {
    for (let i = old_len; i >= at; i--) {
      t[i + offset] = t[i]
    }
  }
  for (let i = 0; i < insert.length; i++) {
    t[at + i] = insert[i]
  }
  // Trim the array to new length
  t.length = old_len + offset + 1
}

function sort_positions(line1: number, col1: number, line2: number, col2: number): [number, number, number, number, boolean] {
  if (line1 > line2 || (line1 === line2 && col1 > col2)) {
    return [line2, col2, line1, col1, true]
  }
  return [line1, col1, line2, col2, false]
}

class Doc {
  lines: (string | undefined)[]
  selection: Selection
  undo_stack: UndoStack
  redo_stack: UndoStack
  clean_change_id: number
  highlighter: Highlighter
  syntax!: Syntax
  filename?: string
  crlf?: boolean
  [key: string]: any

  constructor(filename?: string) {
    this.lines = [undefined]
    this.selection = { a: { line: 1, col: 1 }, b: { line: 1, col: 1 } }
    this.undo_stack = { idx: 1 }
    this.redo_stack = { idx: 1 }
    this.clean_change_id = 1
    this.highlighter = new Highlighter(this)
    this.reset()
    if (filename) {
      this.load(filename)
    }
  }

  reset() {
    this.lines = [undefined, "\n"]
    this.selection = { a: { line: 1, col: 1 }, b: { line: 1, col: 1 } }
    this.undo_stack = { idx: 1 }
    this.redo_stack = { idx: 1 }
    this.clean_change_id = 1
    if (!this.highlighter) {
      this.highlighter = new Highlighter(this)
    }
    this.reset_syntax()
  }

  reset_syntax() {
    const header = this.get_text(1, 1, ...this.position_offset(1, 1, 128))
    const syn = syntax.get(this.filename || "", header)
    if (this.syntax !== syn) {
      this.syntax = syn
      this.highlighter.reset()
    }
  }

  load(filename: string) {
    // In browser context, file loading is not available
    // We reset and set the filename
    this.reset()
    this.filename = filename
    this.lines = [undefined]
    // Since we can't do synchronous file IO in the browser, start with empty
    this.lines.push("\n")
    this.reset_syntax()
  }

  save(filename?: string) {
    filename = filename || this.filename
    if (!filename) throw new Error("no filename set to default to")
    // In browser context, saving is not available
    this.filename = filename
    this.reset_syntax()
    this.clean()
  }

  get_name(): string {
    return this.filename || "unsaved"
  }

  is_dirty(): boolean {
    return this.clean_change_id !== this.get_change_id()
  }

  clean() {
    this.clean_change_id = this.get_change_id()
  }

  get_change_id(): number {
    return this.undo_stack.idx
  }

  set_selection(line1: number, col1: number, line2?: number, col2?: number, swap?: boolean) {
    if (swap) {
      ;[line1, col1, line2, col2] = [line2!, col2!, line1, col1]
    }
    ;[line1, col1] = this.sanitize_position(line1, col1)
    ;[line2, col2] = this.sanitize_position(line2 ?? line1, col2 ?? col1)
    this.selection.a.line = line1
    this.selection.a.col = col1
    this.selection.b.line = line2
    this.selection.b.col = col2
  }

  get_selection(sort?: boolean): [number, number, number, number, boolean] {
    const a = this.selection.a
    const b = this.selection.b
    if (sort) {
      return sort_positions(a.line, a.col, b.line, b.col)
    }
    return [a.line, a.col, b.line, b.col, false]
  }

  has_selection(): boolean {
    const a = this.selection.a
    const b = this.selection.b
    return !(a.line === b.line && a.col === b.col)
  }

  sanitize_selection() {
    const [l1, c1, l2, c2] = this.get_selection()
    this.set_selection(l1, c1, l2, c2)
  }

  sanitize_position(line: number, col: number): [number, number] {
    const nlines = this.lines.length - 1
    line = common.clamp(line, 1, nlines)
    const lineStr = this.lines[line]!
    col = common.clamp(col, 1, lineStr.length || 1)
    return [line, col]
  }

  position_offset(line: number, col: number, ...args: any[]): [number, number] {
    if (typeof args[0] === "function") {
      ;[line, col] = this.sanitize_position(line, col)
      return args[0](this, line, col, ...args.slice(1))
    } else if (args.length === 1) {
      return this.__position_offset_byte(line, col, args[0])
    } else if (args.length === 2) {
      return this.__position_offset_linecol(line, col, args[0], args[1])
    } else {
      throw new Error("bad number of arguments")
    }
  }

  __position_offset_byte(line: number, col: number, offset: number): [number, number] {
    ;[line, col] = this.sanitize_position(line, col)
    col = col + offset
    const nlines = this.lines.length - 1
    while (line > 1 && col < 1) {
      line = line - 1
      col = col + this.lines[line]!.length
    }
    while (line < nlines && col > this.lines[line]!.length) {
      col = col - this.lines[line]!.length
      line = line + 1
    }
    return this.sanitize_position(line, col)
  }

  __position_offset_linecol(line: number, col: number, lineoffset: number, coloffset: number): [number, number] {
    return this.sanitize_position(line + lineoffset, col + coloffset)
  }

  get_text(line1: number, col1: number, line2: number, col2: number): string {
    ;[line1, col1] = this.sanitize_position(line1, Math.min(col1, this.lines[Math.min(line1, this.lines.length - 1)]?.length || 1))
    ;[line2, col2] = this.sanitize_position(line2, Math.min(col2, this.lines[Math.min(line2, this.lines.length - 1)]?.length || 1))
    const [sl1, sc1, sl2, sc2] = sort_positions(line1, col1, line2, col2)
    if (sl1 === sl2) {
      return this.lines[sl1]!.substring(sc1 - 1, sc2 - 1)
    }
    const parts: string[] = [this.lines[sl1]!.substring(sc1 - 1)]
    for (let i = sl1 + 1; i <= sl2 - 1; i++) {
      parts.push(this.lines[i]!)
    }
    parts.push(this.lines[sl2]!.substring(0, sc2 - 1))
    return parts.join("")
  }

  get_char(line: number, col: number): string {
    ;[line, col] = this.sanitize_position(line, col)
    return this.lines[line]!.substring(col - 1, col)
  }

  __push_undo(undo_stack: UndoStack, time: number, type: string, ...args: any[]) {
    const cmd: UndoCmd = { type, time }
    for (let i = 0; i < args.length; i++) {
      cmd[i] = args[i]
    }
    undo_stack[undo_stack.idx] = cmd
    delete undo_stack[undo_stack.idx - config.max_undos]
    undo_stack.idx = undo_stack.idx + 1
  }

  __pop_undo(undo_stack: UndoStack, redo_stack: UndoStack): void {
    // pop command
    const cmd = undo_stack[undo_stack.idx - 1]
    if (!cmd) return
    undo_stack.idx = undo_stack.idx - 1

    // handle command
    if (cmd.type === "insert") {
      const line = cmd[0], col = cmd[1], text = cmd[2]
      this.raw_insert(line, col, text, redo_stack, cmd.time)
    } else if (cmd.type === "remove") {
      const line1 = cmd[0], col1 = cmd[1], line2 = cmd[2], col2 = cmd[3]
      this.raw_remove(line1, col1, line2, col2, redo_stack, cmd.time)
    } else if (cmd.type === "selection") {
      this.selection.a.line = cmd[0]
      this.selection.a.col = cmd[1]
      this.selection.b.line = cmd[2]
      this.selection.b.col = cmd[3]
    }

    // if next undo command is within the merge timeout then treat as a single
    // command and continue to execute it
    const next = undo_stack[undo_stack.idx - 1]
    if (next && Math.abs(cmd.time - next.time) < config.undo_merge_timeout) {
      return this.__pop_undo(undo_stack, redo_stack)
    }
  }

  raw_insert(line: number, col: number, text: string, undo_stack: UndoStack, time: number) {
    // split text into lines and merge with line at insertion point
    const lines = split_lines(text)
    const before = this.lines[line]!.substring(0, col - 1)
    const after = this.lines[line]!.substring(col - 1)
    for (let i = 1; i <= lines.length - 2; i++) {
      lines[i] = lines[i] + "\n"
    }
    lines[1] = before + lines[1]
    lines[lines.length - 1] = lines[lines.length - 1] + after

    // splice lines into line array
    splice(this.lines, line, 1, lines.slice(1))

    // push undo
    const [line2, col2] = this.position_offset(line, col, text.length)
    this.__push_undo(undo_stack, time, "selection", ...this.get_selection())
    this.__push_undo(undo_stack, time, "remove", line, col, line2, col2)

    // update highlighter and assure selection is in bounds
    this.highlighter.invalidate(line)
    this.sanitize_selection()
  }

  raw_remove(line1: number, col1: number, line2: number, col2: number, undo_stack: UndoStack, time: number) {
    // push undo
    const text = this.get_text(line1, col1, line2, col2)
    this.__push_undo(undo_stack, time, "selection", ...this.get_selection())
    this.__push_undo(undo_stack, time, "insert", line1, col1, text)

    // get line content before/after removed text
    const before = this.lines[line1]!.substring(0, col1 - 1)
    const after = this.lines[line2]!.substring(col2 - 1)

    // splice line into line array
    splice(this.lines, line1, line2 - line1 + 1, [before + after])

    // update highlighter and assure selection is in bounds
    this.highlighter.invalidate(line1)
    this.sanitize_selection()
  }

  insert(line: number, col: number, text: string) {
    this.redo_stack = { idx: 1 }
    ;[line, col] = this.sanitize_position(line, col)
    this.raw_insert(line, col, text, this.undo_stack, system.get_time())
  }

  remove(line1: number, col1: number, line2: number, col2: number) {
    this.redo_stack = { idx: 1 }
    ;[line1, col1] = this.sanitize_position(line1, col1)
    ;[line2, col2] = this.sanitize_position(line2, col2)
    ;[line1, col1, line2, col2] = sort_positions(line1, col1, line2, col2)
    this.raw_remove(line1, col1, line2, col2, this.undo_stack, system.get_time())
  }

  undo() {
    this.__pop_undo(this.undo_stack, this.redo_stack)
  }

  redo() {
    this.__pop_undo(this.redo_stack, this.undo_stack)
  }

  text_input(text: string) {
    if (this.has_selection()) {
      this.delete_to()
    }
    const [line, col] = this.get_selection()
    this.insert(line, col, text)
    this.move_to(text.length)
  }

  replace(fn: (text: string) => [string, number]): number {
    let line1: number, col1: number, line2: number, col2: number, swap: boolean
    const had_selection = this.has_selection()
    if (had_selection) {
      ;[line1, col1, line2, col2, swap] = this.get_selection(true)
    } else {
      line1 = 1
      col1 = 1
      line2 = this.lines.length - 1
      col2 = this.lines[this.lines.length - 1]!.length
      swap = false
    }
    const old_text = this.get_text(line1!, col1!, line2!, col2!)
    const [new_text, n] = fn(old_text)
    if (old_text !== new_text) {
      this.insert(line2!, col2!, new_text)
      this.remove(line1!, col1!, line2!, col2!)
      if (had_selection) {
        const [nl2, nc2] = this.position_offset(line1!, col1!, new_text.length)
        this.set_selection(line1!, col1!, nl2, nc2, swap!)
      }
    }
    return n
  }

  delete_to(...args: any[]) {
    const sel = this.get_selection(true)
    const line = sel[0]
    const col = sel[1]
    if (this.has_selection()) {
      const s = this.get_selection()
      this.remove(s[0], s[1], s[2], s[3])
    } else {
      const [line2, col2] = this.position_offset(line, col, ...args)
      this.remove(line, col, line2, col2)
      const [sl, sc] = sort_positions(line, col, line2, col2)
      this.set_selection(sl, sc)
      return
    }
    this.set_selection(line, col)
  }

  move_to(...args: any[]) {
    const [line, col] = this.get_selection()
    const [nl, nc] = this.position_offset(line, col, ...args)
    this.set_selection(nl, nc)
  }

  select_to(...args: any[]) {
    const [line, col, line2, col2] = this.get_selection()
    const [nl, nc] = this.position_offset(line, col, ...args)
    this.set_selection(nl, nc, line2, col2)
  }
}

export { Doc, split_lines, sort_positions }
export default Doc
