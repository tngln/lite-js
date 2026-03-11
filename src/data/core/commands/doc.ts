import type { Core } from "../index"
import command from "../command"
import config from "../config"
import common from "../common"
import translate from "../doc/translate"
import search from "../doc/search"
import { DocView } from "../docview"
import type { Doc } from "../doc/init"
import { sort_positions } from "../doc/init"

function __get_core(): Core {
  return (globalThis as any).__lite_core as Core
}

function dv(): DocView {
  return __get_core().active_view as DocView
}

function doc(): Doc {
  return (__get_core().active_view as DocView).doc
}

function get_indent_string(): string {
  if (config.tab_type === "hard") {
    return "\t"
  }
  return " ".repeat(config.indent_size)
}

function insert_at_start_of_selected_lines(text: string, skip_empty?: boolean) {
  const [line1, col1, line2, col2, swap] = doc().get_selection(true)
  for (let line = line1; line <= line2; line++) {
    const line_text = doc().lines[line]!
    if (!skip_empty || /\S/.test(line_text)) {
      doc().insert(line, 1, text)
    }
  }
  doc().set_selection(line1, col1 + text.length, line2, col2 + text.length, swap)
}

function remove_from_start_of_selected_lines(text: string, skip_empty?: boolean) {
  const [line1, col1, line2, col2, swap] = doc().get_selection(true)
  for (let line = line1; line <= line2; line++) {
    const line_text = doc().lines[line]!
    if (line_text.startsWith(text) && (!skip_empty || /\S/.test(line_text))) {
      doc().remove(line, 1, line, text.length + 1)
    }
  }
  doc().set_selection(line1, col1 - text.length, line2, col2 - text.length, swap)
}

function append_line_if_last_line(line: number) {
  if (line >= doc().lines.length - 1) {
    doc().insert(line, Infinity, "\n")
  }
}

function save(filename?: string) {
  doc().save(filename)
  __get_core().log('Saved "%s"', doc().filename)
}

const commands: Record<string, () => void> = {
  ["doc:undo"]: function() {
    doc().undo()
  },

  ["doc:redo"]: function() {
    doc().redo()
  },

  ["doc:cut"]: function() {
    if (doc().has_selection()) {
      const [l1, c1, l2, c2] = doc().get_selection() as [number, number, number, number, boolean]
      const text = doc().get_text(l1, c1, l2, c2)
      navigator.clipboard.writeText(text).catch(() => {})
      doc().delete_to(0)
    }
  },

  ["doc:copy"]: function() {
    if (doc().has_selection()) {
      const [l1, c1, l2, c2] = doc().get_selection() as [number, number, number, number, boolean]
      const text = doc().get_text(l1, c1, l2, c2)
      navigator.clipboard.writeText(text).catch(() => {})
    }
  },

  ["doc:paste"]: function() {
    navigator.clipboard.readText().then(text => {
      doc().text_input(text.replace(/\r/g, ""))
    }).catch(() => {})
  },

  ["doc:newline"]: function() {
    const [line, col] = doc().get_selection()
    let indent = doc().lines[line]!.match(/^[\t ]*/)?.[0] || ""
    if (col <= indent.length) {
      indent = indent.substring(indent.length + 1 - col)
    }
    doc().text_input("\n" + indent)
  },

  ["doc:newline-below"]: function() {
    const [line] = doc().get_selection()
    const indent = doc().lines[line]!.match(/^[\t ]*/)?.[0] || ""
    doc().insert(line, Infinity, "\n" + indent)
    doc().set_selection(line + 1, Infinity)
  },

  ["doc:newline-above"]: function() {
    const [line] = doc().get_selection()
    const indent = doc().lines[line]!.match(/^[\t ]*/)?.[0] || ""
    doc().insert(line, 1, indent + "\n")
    doc().set_selection(line, Infinity)
  },

  ["doc:delete"]: function() {
    const [line, col] = doc().get_selection()
    if (!doc().has_selection() && /^\s*$/.test(doc().lines[line]!.substring(col - 1))) {
      doc().remove(line, col, line, Infinity)
    }
    doc().delete_to(translate.next_char)
  },

  ["doc:backspace"]: function() {
    const [line, col] = doc().get_selection()
    if (!doc().has_selection()) {
      const text = doc().get_text(line, 1, line, col)
      if (text.length >= config.indent_size && /^ *$/.test(text)) {
        doc().delete_to(0, -config.indent_size)
        return
      }
    }
    doc().delete_to(translate.previous_char)
  },

  ["doc:select-all"]: function() {
    doc().set_selection(1, 1, Infinity, Infinity)
  },

  ["doc:select-none"]: function() {
    const [line, col] = doc().get_selection()
    doc().set_selection(line, col)
  },

  ["doc:select-lines"]: function() {
    const [line1, , line2, , swap] = doc().get_selection(true)
    append_line_if_last_line(line2)
    doc().set_selection(line1, 1, line2 + 1, 1, swap)
  },

  ["doc:select-word"]: function() {
    const [line1, col1] = doc().get_selection(true)
    const [l1, c1] = translate.start_of_word(doc(), line1, col1)
    const [l2, c2] = translate.end_of_word(doc(), l1, c1)
    doc().set_selection(l2, c2, l1, c1)
  },

  ["doc:join-lines"]: function() {
    const [line1, , line2] = doc().get_selection(true)
    const ll2 = line1 === line2 ? line2 + 1 : line2
    let text = doc().get_text(line1, 1, ll2, Infinity)
    text = text.replace(/(.*)\n[\t ]*/g, (_, x) => /^\s*$/.test(x) ? x : x + " ")
    doc().insert(line1, 1, text)
    doc().remove(line1, text.length + 1, ll2, Infinity)
    if (doc().has_selection()) {
      doc().set_selection(line1, Infinity)
    }
  },

  ["doc:indent"]: function() {
    const text = get_indent_string()
    if (doc().has_selection()) {
      insert_at_start_of_selected_lines(text)
    } else {
      doc().text_input(text)
    }
  },

  ["doc:unindent"]: function() {
    const text = get_indent_string()
    remove_from_start_of_selected_lines(text)
  },

  ["doc:duplicate-lines"]: function() {
    const [line1, col1, line2, col2, swap] = doc().get_selection(true)
    append_line_if_last_line(line2)
    const text = doc().get_text(line1, 1, line2 + 1, 1)
    doc().insert(line2 + 1, 1, text)
    const n = line2 - line1 + 1
    doc().set_selection(line1 + n, col1, line2 + n, col2, swap)
  },

  ["doc:delete-lines"]: function() {
    const [line1, col1, line2] = doc().get_selection(true)
    append_line_if_last_line(line2)
    doc().remove(line1, 1, line2 + 1, 1)
    doc().set_selection(line1, col1)
  },

  ["doc:move-lines-up"]: function() {
    const [line1, col1, line2, col2, swap] = doc().get_selection(true)
    append_line_if_last_line(line2)
    if (line1 > 1) {
      const text = doc().lines[line1 - 1]!
      doc().insert(line2 + 1, 1, text)
      doc().remove(line1 - 1, 1, line1, 1)
      doc().set_selection(line1 - 1, col1, line2 - 1, col2, swap)
    }
  },

  ["doc:move-lines-down"]: function() {
    const [line1, col1, line2, col2, swap] = doc().get_selection(true)
    append_line_if_last_line(line2 + 1)
    if (line2 < doc().lines.length - 1) {
      const text = doc().lines[line2 + 1]!
      doc().remove(line2 + 1, 1, line2 + 2, 1)
      doc().insert(line1, 1, text)
      doc().set_selection(line1 + 1, col1, line2 + 1, col2, swap)
    }
  },

  ["doc:toggle-line-comments"]: function() {
    const comment = (doc() as any).syntax?.comment
    if (!comment) return
    const comment_text = comment + " "
    const [line1, , line2] = doc().get_selection(true)
    let uncomment = true
    for (let line = line1; line <= line2; line++) {
      const text = doc().lines[line]!
      if (/\S/.test(text) && !text.startsWith(comment_text)) {
        uncomment = false
      }
    }
    if (uncomment) {
      remove_from_start_of_selected_lines(comment_text, true)
    } else {
      insert_at_start_of_selected_lines(comment_text, true)
    }
  },

  ["doc:upper-case"]: function() {
    doc().replace((text) => [text.toUpperCase(), 1])
  },

  ["doc:lower-case"]: function() {
    doc().replace((text) => [text.toLowerCase(), 1])
  },

  ["doc:go-to-line"]: function() {
    const cur_dv = dv()
    let items: any[] | null = null

    function init_items() {
      if (items) return
      items = [undefined]
      for (let i = 1; i <= cur_dv.doc.lines.length - 1; i++) {
        const line = cur_dv.doc.lines[i]!
        items.push({ text: line.replace(/\n$/, ""), line: i, info: "line: " + i })
      }
    }

    __get_core().command_view.enter("Go To Line", function(text: string, item: any) {
      const line = item?.line ?? parseInt(text, 10)
      if (!line || isNaN(line)) {
        __get_core().error("Invalid line number or unmatched string")
        return
      }
      cur_dv.doc.set_selection(line, 1)
      cur_dv.scroll_to_line(line, true)
    }, function(text: string) {
      if (!/^\d*$/.test(text)) {
        init_items()
        return common.fuzzy_match(items!, text) as any[]
      }
      return [undefined]
    })
  },

  ["doc:toggle-line-ending"]: function() {
    doc().crlf = !doc().crlf
  },

  ["doc:save-as"]: function() {
    if (doc().filename) {
      __get_core().command_view.set_text(doc().filename!)
    }
    __get_core().command_view.enter("Save As", function(filename: string) {
      save(filename)
    }, common.path_suggest)
  },

  ["doc:save"]: function() {
    if (doc().filename) {
      save()
    } else {
      command.perform("doc:save-as")
    }
  },

  ["doc:rename"]: function() {
    const old_filename = doc().filename
    if (!old_filename) {
      __get_core().error("Cannot rename unsaved doc")
      return
    }
    __get_core().command_view.set_text(old_filename)
    __get_core().command_view.enter("Rename", function(filename: string) {
      doc().save(filename)
      __get_core().log('Renamed "%s" to "%s"', old_filename, filename)
    }, common.path_suggest)
  },
}

const translations: Record<string, (doc: Doc, line: number, col: number, dv?: DocView) => [number, number]> = {
  ["previous-char"]: translate.previous_char as any,
  ["next-char"]: translate.next_char as any,
  ["previous-word-start"]: translate.previous_word_start as any,
  ["next-word-end"]: translate.next_word_end as any,
  ["previous-block-start"]: translate.previous_block_start as any,
  ["next-block-end"]: translate.next_block_end as any,
  ["start-of-doc"]: translate.start_of_doc as any,
  ["end-of-doc"]: translate.end_of_doc as any,
  ["start-of-line"]: translate.start_of_line as any,
  ["end-of-line"]: translate.end_of_line as any,
  ["start-of-word"]: translate.start_of_word as any,
  ["end-of-word"]: translate.end_of_word as any,
  ["previous-line"]: DocView.translate["previous_line"] as any,
  ["next-line"]: DocView.translate["next_line"] as any,
  ["previous-page"]: DocView.translate["previous_page"] as any,
  ["next-page"]: DocView.translate["next_page"] as any,
}

for (const name in translations) {
  const fn = translations[name]
  commands[`doc:move-to-${name}`] = function() { doc().move_to(fn, dv()) }
  commands[`doc:select-to-${name}`] = function() { doc().select_to(fn, dv()) }
  commands[`doc:delete-to-${name}`] = function() { doc().delete_to(fn, dv()) }
}

commands["doc:move-to-previous-char"] = function() {
  if (doc().has_selection()) {
    const [line, col] = doc().get_selection(true)
    doc().set_selection(line, col)
  } else {
    doc().move_to(translate.previous_char)
  }
}

commands["doc:move-to-next-char"] = function() {
  if (doc().has_selection()) {
    const [, , line, col] = doc().get_selection(true)
    doc().set_selection(line, col)
  } else {
    doc().move_to(translate.next_char)
  }
}

command.add(DocView, commands)
