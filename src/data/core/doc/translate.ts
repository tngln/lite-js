import common from "../common"
import config from "../config"

// functions for translating a Doc position to another position these functions
// can be passed to Doc:move_to|select_to|delete_to()

type Doc = import("./init").Doc

let translate = (() => {
  function is_non_word(char: string) {
    return config.non_word_chars.indexOf(char) !== -1
  }

  function previous_char(doc: Doc, line: number, col: number): [number, number] {
    do {
      ;[line, col] = doc.position_offset(line, col, -1)
    } while (common.is_utf8_cont(doc.get_char(line, col)))
    return [line, col]
  }

  function next_char(doc: Doc, line: number, col: number): [number, number] {
    do {
      ;[line, col] = doc.position_offset(line, col, 1)
    } while (common.is_utf8_cont(doc.get_char(line, col)))
    return [line, col]
  }

  function previous_word_start(doc: Doc, line: number, col: number): [number, number] {
    let prev: string | undefined
    while (line > 1 || col > 1) {
      const [l, c] = doc.position_offset(line, col, -1)
      const char = doc.get_char(l, c)
      if (prev !== undefined && prev !== char || !is_non_word(char)) {
        break
      }
      prev = char
      line = l
      col = c
    }
    return start_of_word(doc, line, col)
  }

  function next_word_end(doc: Doc, line: number, col: number): [number, number] {
    let prev: string | undefined
    const [end_line, end_col] = end_of_doc(doc, line, col)
    while (line < end_line || col < end_col) {
      const char = doc.get_char(line, col)
      if (prev !== undefined && prev !== char || !is_non_word(char)) {
        break
      }
      ;[line, col] = doc.position_offset(line, col, 1)
      prev = char
    }
    return end_of_word(doc, line, col)
  }

  function start_of_word(doc: Doc, line: number, col: number): [number, number] {
    while (true) {
      const [line2, col2] = doc.position_offset(line, col, -1)
      const char = doc.get_char(line2, col2)
      if (is_non_word(char) || (line === line2 && col === col2)) {
        break
      }
      line = line2
      col = col2
    }
    return [line, col]
  }

  function end_of_word(doc: Doc, line: number, col: number): [number, number] {
    while (true) {
      const [line2, col2] = doc.position_offset(line, col, 1)
      const char = doc.get_char(line, col)
      if (is_non_word(char) || (line === line2 && col === col2)) {
        break
      }
      line = line2
      col = col2
    }
    return [line, col]
  }

  function previous_block_start(doc: Doc, line: number, col: number): [number, number] {
    while (true) {
      line = line - 1
      if (line <= 1) {
        return [1, 1]
      }
      const prevLine = doc.lines[line - 1] || ""
      const currLine = doc.lines[line] || ""
      if (/^\s*$/.test(prevLine) && !/^\s*$/.test(currLine)) {
        const m = currLine.match(/\S/)
        return [line, m ? m.index! + 1 : 1]
      }
    }
  }

  function next_block_end(doc: Doc, line: number, col: number): [number, number] {
    while (true) {
      if (line >= doc.lines.length - 1) {
        return [doc.lines.length - 1, 1]
      }
      const nextLine = doc.lines[line + 1] || ""
      const currLine = doc.lines[line] || ""
      if (/^\s*$/.test(nextLine) && !/^\s*$/.test(currLine)) {
        return [line + 1, nextLine.length]
      }
      line = line + 1
    }
  }

  function start_of_line(doc: Doc, line: number, col: number): [number, number] {
    return [line, 1]
  }

  function end_of_line(doc: Doc, line: number, col: number): [number, number] {
    return [line, Infinity]
  }

  function start_of_doc(doc: Doc, line: number, col: number): [number, number] {
    return [1, 1]
  }

  function end_of_doc(doc: Doc, line: number, col: number): [number, number] {
    const last = doc.lines[doc.lines.length - 1] || ""
    return [doc.lines.length - 1, last.length]
  }

  return {
    previous_char,
    next_char,
    previous_word_start,
    next_word_end,
    start_of_word,
    end_of_word,
    previous_block_start,
    next_block_end,
    start_of_line,
    end_of_line,
    start_of_doc,
    end_of_doc,
  }
})()

export { translate }
export default translate
