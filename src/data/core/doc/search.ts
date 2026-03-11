type Doc = import("./init").Doc

type SearchOpt = {
  no_case?: boolean
  pattern?: boolean
  wrap?: boolean
}

let search = (() => {
  const default_opt: SearchOpt = {}

  function pattern_lower(str: string) {
    if (str.startsWith("%")) {
      return str
    }
    return str.toLowerCase()
  }

  function init_args(doc: Doc, line: number, col: number, text: string, opt: SearchOpt) {
    opt = opt || default_opt
    ;[line, col] = doc.sanitize_position(line, col)

    if (opt.no_case) {
      if (opt.pattern) {
        text = text.replace(/%?./g, pattern_lower)
      } else {
        text = text.toLowerCase()
      }
    }

    return { doc, line, col, text, opt }
  }

  function find(doc: Doc, line: number, col: number, text: string, opt?: SearchOpt): [number, number, number, number] | null {
    const args = init_args(doc, line, col, text, opt || default_opt)
    line = args.line
    col = args.col
    text = args.text
    opt = args.opt

    for (let l = line; l <= doc.lines.length - 1; l++) {
      const raw_text = doc.lines[l]
      if (!raw_text) { col = 1; continue }
      let line_text = raw_text
      if (opt.no_case) {
        line_text = line_text.toLowerCase()
      }
      let s: number, e: number
      if (opt.pattern) {
        // Use as a regex pattern
        try {
          const re = new RegExp(text, "g")
          re.lastIndex = l === line ? col - 1 : 0
          const m = re.exec(line_text)
          if (m && m.index !== undefined) {
            s = m.index + 1
            e = m.index + m[0].length
          } else {
            col = 1
            continue
          }
        } catch {
          col = 1
          continue
        }
      } else {
        // Plain text search
        const startIdx = l === line ? col - 1 : 0
        const idx = line_text.indexOf(text, startIdx)
        if (idx !== -1) {
          s = idx + 1
          e = idx + text.length
        } else {
          col = 1
          continue
        }
      }
      return [l, s, l, e + 1]
    }

    if (opt.wrap) {
      const new_opt: SearchOpt = { no_case: opt.no_case, pattern: opt.pattern }
      return find(doc, 1, 1, text, new_opt)
    }
    return null
  }

  return { find }
})()

export type { SearchOpt }
export { search }
export default search
