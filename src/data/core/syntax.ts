import common from "./common"
import type { Syntax } from "./tokenizer"

let syntax = (() => {
  const items: Syntax[] = []

  const plain_text_syntax: Syntax = { patterns: [], symbols: {} }

  function add(t: Syntax) {
    items.push(t)
  }

  function find(string: string, field: "files" | "headers") {
    for (let i = items.length - 1; i >= 0; i--) {
      const t = items[i]
      const pat = (t as any)[field]
      if (pat && common.match_pattern(string, pat)) {
        return t
      }
    }
    return null
  }

  function get(filename: string, header: string): Syntax {
    return find(filename, "files")
        || find(header, "headers")
        || plain_text_syntax
  }

  return { items, add, get }
})()

export type { Syntax }
export { syntax }
export default syntax
