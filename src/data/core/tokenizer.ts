type TokenState = number | null | undefined

type TokenList = (string | undefined)[]

type Pattern = string | [string, string, string?]

type SyntaxPattern = {
  type: string
  pattern: Pattern
}

type Syntax = {
  patterns: SyntaxPattern[]
  symbols: Record<string, string>
  comment?: string
  headers?: string | string[]
  files?: string | string[]
}

let tokenizer = (() => {
  function push_token(t: TokenList, type: string, text: string) {
    const prev_type = t[t.length - 2]
    const prev_text = t[t.length - 1]
    if (prev_type !== undefined && (prev_type === type || /^\s*$/.test(prev_text!))) {
      t[t.length - 2] = type
      t[t.length - 1] = prev_text! + text
    } else {
      t.push(type)
      t.push(text)
    }
  }

  function is_escaped(text: string, idx: number, esc: string) {
    const byte = esc.charCodeAt(0)
    let count = 0
    for (let i = idx - 1; i >= 0; i--) {
      if (text.charCodeAt(i) !== byte) break
      count++
    }
    return count % 2 === 1
  }

  function find_non_escaped(text: string, pattern: string, offset: number, esc?: string): [number, number] | null {
    const re = new RegExp(pattern, "g")
    re.lastIndex = offset
    while (true) {
      const m = re.exec(text)
      if (!m) break
      if (esc && is_escaped(text, m.index, esc)) {
        re.lastIndex = m.index + m[0].length
      } else {
        return [m.index, m.index + m[0].length - 1]
      }
    }
    return null
  }

  function tokenize(syntax: Syntax, text: string, state?: TokenState): [TokenList, TokenState] {
    const res: TokenList = []
    let i = 0

    if (syntax.patterns.length === 0) {
      return [["normal", text], undefined]
    }

    while (i <= text.length - 1) {
      // continue trying to match the end pattern of a pair if we have a state set
      if (state !== null && state !== undefined) {
        const p = syntax.patterns[state as number]
        const pat = p.pattern as [string, string, string?]
        const found = find_non_escaped(text, pat[1], i, pat[2])

        if (found) {
          const [s, e] = found
          push_token(res, p.type, text.substring(i, e + 1))
          state = null
          i = e + 1
        } else {
          push_token(res, p.type, text.substring(i))
          break
        }
      }

      // find matching pattern
      let matched = false
      for (let n = 0; n <= syntax.patterns.length - 1; n++) {
        const p = syntax.patterns[n]
        const pattern = Array.isArray(p.pattern) ? p.pattern[0] : p.pattern
        const re = new RegExp("^(?:" + pattern + ")")
        const m = re.exec(text.substring(i))

        if (m) {
          // matched pattern; make and add token
          const t = text.substring(i, i + m[0].length)
          push_token(res, syntax.symbols[t] || p.type, t)

          // update state if this was a start|end pattern pair
          if (Array.isArray(p.pattern)) {
            state = n
          }

          // move cursor past this token
          i = i + m[0].length
          matched = true
          break
        }
      }

      // consume character if we didn't match
      if (!matched) {
        push_token(res, "normal", text.substring(i, i + 1))
        i = i + 1
      }
    }

    return [res, state]
  }

  function* each_token(t: TokenList): Generator<[number, string, string]> {
    let i = 0
    while (i + 1 < t.length) {
      yield [i, t[i] as string, t[i + 1] as string]
      i += 2
    }
  }

  return { tokenize, each_token }
})()

export type { Syntax, SyntaxPattern, TokenList, TokenState }
export { tokenizer }
export default tokenizer
