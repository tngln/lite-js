import type { Core } from "../index"
import config from "../config"
import tokenizer from "../tokenizer"
import type { TokenList, TokenState } from "../tokenizer"
import type { Doc } from "./init"

// core is imported lazily to avoid circular deps
function __get_core(): Core {
  return (globalThis as any).__lite_core as Core
}

type HighlighterLine = {
  init_state: TokenState
  text: string
  tokens: TokenList
  state: TokenState
}

class Highlighter {
  doc: Doc
  lines: (HighlighterLine | null)[]
  first_invalid_line: number
  max_wanted_line: number

  constructor(doc: Doc) {
    this.doc = doc
    this.lines = []
    this.first_invalid_line = 1
    this.max_wanted_line = 0

    // init incremental syntax highlighting
    __get_core().add_thread(() => this.__highlight_thread(), this)
  }

  *__highlight_thread(): Generator<number | undefined, void, unknown> {
    while (true) {
      if (this.first_invalid_line > this.max_wanted_line) {
        this.max_wanted_line = 0
        yield 1 / config.fps

      } else {
        const max = Math.min(this.first_invalid_line + 40, this.max_wanted_line)

        for (let i = this.first_invalid_line; i <= max; i++) {
          const state = (i > 1) ? (this.lines[i - 1] ? this.lines[i - 1]!.state : undefined) : undefined
          const line = this.lines[i]
          if (!(line && line.init_state === state)) {
            this.lines[i] = this.tokenize_line(i, state)
          }
        }

        this.first_invalid_line = max + 1
        __get_core().redraw = true
        yield undefined
      }
    }
  }

  reset() {
    this.lines = []
    this.first_invalid_line = 1
    this.max_wanted_line = 0
  }

  invalidate(idx: number) {
    this.first_invalid_line = Math.min(this.first_invalid_line, idx)
    this.max_wanted_line = Math.min(this.max_wanted_line, this.doc.lines.length - 1)
  }

  tokenize_line(idx: number, state: TokenState): HighlighterLine {
    const res: Partial<HighlighterLine> = {}
    res.init_state = state
    res.text = this.doc.lines[idx]
    ;[res.tokens, res.state] = tokenizer.tokenize(this.doc.syntax, res.text!, state)
    return res as HighlighterLine
  }

  get_line(idx: number): HighlighterLine {
    let line = this.lines[idx]
    if (!line || line.text !== this.doc.lines[idx]) {
      const prev = this.lines[idx - 1]
      line = this.tokenize_line(idx, prev ? prev.state : undefined)
      this.lines[idx] = line
    }
    this.max_wanted_line = Math.max(this.max_wanted_line, idx)
    return line
  }

  each_token(idx: number) {
    return tokenizer.each_token(this.get_line(idx).tokens)
  }
}

export { Highlighter }
export default Highlighter
