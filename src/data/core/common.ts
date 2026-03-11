import * as renderer from "../../api/renderer"
import * as system from "../../api/system"
import { G } from "../../G"

type RenFont = import("../../platform/renderer").RenFont
type RenColor = import("../../platform/renderer").RenColor

let common = (() => {
  function is_utf8_cont(char: string) {
    const byte = char.charCodeAt(0)
    return byte >= 0x80 && byte < 0xc0
  }

  function utf8_chars(text: string) {
    // yields each UTF-8 character in the string
    return text.match(/[\u0000-\u007f\u00c2-\u00f4][\u0080-\u00bf]*/g) || []
  }

  function clamp(n: number, lo: number, hi: number) {
    return Math.max(Math.min(n, hi), lo)
  }

  function round(n: number) {
    return n >= 0 ? Math.floor(n + 0.5) : Math.ceil(n - 0.5)
  }

  function lerp(a: any, b: any, t: number): any {
    if (typeof a !== "object") {
      return a + (b - a) * t
    }
    const res: Record<string, number> = {}
    for (const k in b) {
      res[k] = lerp(a[k], b[k], t)
    }
    return res
  }

  function color(str: string): [number, number, number, number] {
    let r: number, g: number, b: number, a: number
    const hex = str.match(/^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/)
    if (hex) {
      r = parseInt(hex[1], 16)
      g = parseInt(hex[2], 16)
      b = parseInt(hex[3], 16)
      a = 1
    } else if (/^rgba?\s*\([\d\s.,]+\)$/.test(str)) {
      const nums = str.match(/[\d.]+/g) || []
      r = parseFloat(nums[0] || "0")
      g = parseFloat(nums[1] || "0")
      b = parseFloat(nums[2] || "0")
      a = parseFloat(nums[3] ?? "1")
    } else {
      throw new Error(`bad color string '${str}'`)
    }
    return [r, g, b, a * 0xff]
  }

  function compare_score(a: { score: number }, b: { score: number }) {
    return a.score > b.score ? -1 : a.score < b.score ? 1 : 0
  }

  function fuzzy_match_items(items: any[], needle: string) {
    const res: Array<{ text: any; score: number }> = []
    for (let i = 1; i <= items.length - 1; i++) {
      const item = items[i]
      const score = system.fuzzy_match(String(item), needle)
      if (score !== null) {
        res.push({ text: item, score })
      }
    }
    res.sort(compare_score)
    const out: any[] = [undefined]
    for (let i = 0; i < res.length; i++) {
      out.push(res[i].text)
    }
    return out
  }

  function fuzzy_match(haystack: any[] | string, needle: string): any {
    if (Array.isArray(haystack)) {
      return fuzzy_match_items(haystack, needle)
    }
    return system.fuzzy_match(haystack, needle)
  }

  function path_suggest(text: string) {
    const m = text.match(/^(.*?)([^/\\]*)$/)
    const path = m ? m[1] : ""
    const files = system.list_dir(path === "" ? "." : path) || []
    const res: any[] = [undefined]
    const PATHSEP = G["PATHSEP"] as string || "/"
    for (let i = 1; i <= files.length - 1; i++) {
      let file = path + files[i]
      const info = system.get_file_info(file)
      if (info) {
        if (info.type === "dir") {
          file = file + PATHSEP
        }
        if (file.toLowerCase().indexOf(text.toLowerCase()) === 0) {
          res.push(file)
        }
      }
    }
    return res
  }

  function match_pattern(text: string, pattern: string | string[], ...args: any[]): [number, number] | false {
    if (typeof pattern === "string") {
      // Convert the pattern to a RegExp offset search
      // We use indexOf for plain text or pattern matching
      const re = new RegExp(pattern)
      const m = text.match(re)
      if (m && m.index !== undefined) {
        return [m.index + 1, m.index + m[0].length]
      }
      return false
    }
    for (let i = 1; i <= pattern.length - 1; i++) {
      const p = pattern[i]
      const res = match_pattern(text, p, ...args)
      if (res) return res
    }
    return false
  }

  function draw_text(font: RenFont, color: RenColor, text: string, align: string | null, x: number, y: number, w: number, h: number): [number, number] {
    const actualW = font.get_width(text)
    const actualH = font.get_height()
    if (align === "center") {
      x = x + (w - actualW) / 2
    } else if (align === "right") {
      x = x + (w - actualW)
    }
    y = round(y + (h - actualH) / 2)
    const nx = renderer.draw_text(font, text, x, y, color)
    return [nx, y + actualH]
  }

  function bench(name: string, fn: (...args: any[]) => any, ...args: any[]) {
    const start = system.get_time()
    const res = fn(...args)
    const t = system.get_time() - start
    const ms = t * 1000
    const per = (t / (1 / 60)) * 100
    console.log(`*** ${name.padEnd(16)} : ${ms.toFixed(3)}ms ${per.toFixed(2)}%`)
    return res
  }

  return {
    is_utf8_cont,
    utf8_chars,
    clamp,
    round,
    lerp,
    color,
    fuzzy_match,
    path_suggest,
    match_pattern,
    draw_text,
    bench,
  }
})()

export { common }
export default common
