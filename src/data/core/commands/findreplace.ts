import type { Core } from "../index"
import command from "../command"
import config from "../config"
import search from "../doc/search"
import { DocView } from "../docview"
import type { Doc } from "../doc/init"

function __get_core(): Core {
  return (globalThis as any).__lite_core as Core
}

function doc(): Doc {
  return (__get_core().active_view as DocView).doc
}

const max_previous_finds = 50

let previous_finds: [number, number, number, number][] | null = null
let last_doc: Doc | null = null
let last_fn: ((doc: Doc, line: number, col: number, text: string) => [number, number, number, number] | null) | null = null
let last_text = ""

function push_previous_find(d: Doc, sel?: [number, number, number, number]) {
  if (last_doc !== d) {
    last_doc = d
    previous_finds = []
  }
  if (!previous_finds) previous_finds = []
  if (previous_finds.length >= max_previous_finds) {
    previous_finds.shift()
  }
  if (sel) {
    previous_finds.push(sel)
  } else {
    const s = d.get_selection()
    previous_finds.push([s[0], s[1], s[2], s[3]])
  }
}

function find(label: string, search_fn: (doc: Doc, line: number, col: number, text: string) => [number, number, number, number] | null) {
  const cur_dv = __get_core().active_view as DocView
  const sel = cur_dv.doc.get_selection()
  const sel4: [number, number, number, number] = [sel[0], sel[1], sel[2], sel[3]]
  const text = cur_dv.doc.get_text(...sel4)
  let found = false

  __get_core().command_view.set_text(text, true)

  __get_core().command_view.enter(label, function(t: string) {
    if (found) {
      last_fn = search_fn
      last_text = t
      previous_finds = []
      push_previous_find(cur_dv.doc, sel4)
    } else {
      __get_core().error('Couldn\'t find "%s"', t)
      cur_dv.doc.set_selection(sel4[0], sel4[1], sel4[2], sel4[3])
      cur_dv.scroll_to_make_visible(sel4[0], sel4[1])
    }
  }, function(t: string) {
    let result: [number, number, number, number] | null = null
    try {
      result = search_fn(cur_dv.doc, sel4[0], sel4[1], t)
    } catch {}
    if (result && t !== "") {
      const [line1, col1, line2, col2] = result
      cur_dv.doc.set_selection(line2, col2, line1, col1)
      cur_dv.scroll_to_line(line2, true)
      found = true
    } else {
      cur_dv.doc.set_selection(sel4[0], sel4[1], sel4[2], sel4[3])
      found = false
    }
    return [undefined]
  }, function(explicit?: boolean) {
    if (explicit) {
      cur_dv.doc.set_selection(sel4[0], sel4[1], sel4[2], sel4[3])
      cur_dv.scroll_to_make_visible(sel4[0], sel4[1])
    }
  })
}

function replace(kind: string, def_text: string, fn: (text: string, old: string, new_text: string) => [string, number]) {
  __get_core().command_view.set_text(def_text, true)

  __get_core().command_view.enter("Find To Replace " + kind, function(old: string) {
    __get_core().command_view.set_text(old, true)

    const s = `Replace ${kind} "${old}" With`
    __get_core().command_view.enter(s, function(new_text: string) {
      const n = doc().replace(function(text) {
        return fn(text, old, new_text)
      })
      __get_core().log('Replaced %d instance(s) of %s "%s" with "%s"', n, kind, old, new_text)
    })
  })
}

function has_selection() {
  return __get_core().active_view instanceof DocView
      && (__get_core().active_view as DocView).doc.has_selection()
}

command.add(has_selection, {
  ["find-replace:select-next"]: function() {
    const [l1, c1, l2, c2] = doc().get_selection(true)
    const text = doc().get_text(l1, c1, l2, c2)
    const result = search.find(doc(), l2, c2, text, { wrap: true })
    if (result) {
      const [rl1, rc1, rl2, rc2] = result
      doc().set_selection(rl2, rc2, rl1, rc1)
    }
  },
})

command.add(DocView, {
  ["find-replace:find"]: function() {
    find("Find Text", function(d, line, col, text) {
      return search.find(d, line, col, text, { wrap: true, no_case: true })
    })
  },

  ["find-replace:find-pattern"]: function() {
    find("Find Text Pattern", function(d, line, col, text) {
      return search.find(d, line, col, text, { wrap: true, no_case: true, pattern: true })
    })
  },

  ["find-replace:repeat-find"]: function() {
    if (!last_fn) {
      __get_core().error("No find to continue from")
    } else {
      const [line, col] = doc().get_selection()
      const result = last_fn(doc(), line, col, last_text)
      if (result) {
        const [l1, c1, l2, c2] = result
        push_previous_find(doc())
        doc().set_selection(l2, c2, l1, c1)
        ;(__get_core().active_view as DocView).scroll_to_line(l2, true)
      }
    }
  },

  ["find-replace:previous-find"]: function() {
    if (!previous_finds || previous_finds.length === 0 || doc() !== last_doc) {
      __get_core().error("No previous finds")
      return
    }
    const sel = previous_finds.pop()!
    doc().set_selection(sel[0], sel[1], sel[2], sel[3])
    ;(__get_core().active_view as DocView).scroll_to_line(sel[2], true)
  },

  ["find-replace:replace"]: function() {
    replace("Text", "", function(text, old, new_text) {
      const escaped = old.replace(/[^A-Za-z0-9]/g, "\\$&")
      let n = 0
      const result = text.replace(new RegExp(escaped, "g"), () => { n++; return new_text })
      return [result, n]
    })
  },

  ["find-replace:replace-pattern"]: function() {
    replace("Pattern", "", function(text, old, new_text) {
      let n = 0
      const result = text.replace(new RegExp(old, "g"), () => { n++; return new_text })
      return [result, n]
    })
  },

  ["find-replace:replace-symbol"]: function() {
    let first = ""
    if (doc().has_selection()) {
      const s = doc().get_selection()
      const text = doc().get_text(s[0], s[1], s[2], s[3])
      first = text.match(new RegExp(config.symbol_pattern))?.[0] || ""
    }
    replace("Symbol", first, function(text, old, new_text) {
      let n = 0
      const result = text.replace(new RegExp(config.symbol_pattern, "g"), function(sym) {
        if (old === sym) {
          n++
          return new_text
        }
        return sym
      })
      return [result, n]
    })
  },
})
