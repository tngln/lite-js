type RenImage = {
  pixels: Uint8ClampedArray
  width: number
  height: number
  __imageData: ImageData
}

type RenFont = {
  filename: string
  size: number
  height: number
  tab_width: number
  __family: string
  __cssFont: string
}

type RenColor = { b: number, g: number, r: number, a: number }
type RenRect = { x: number, y: number, width: number, height: number }

const MAX_GLYPHSET = 256

let canvas: HTMLCanvasElement | null = null
let ctx: CanvasRenderingContext2D | null = null
let devicePixelRatio = 1
let canvasSize = { width: 0, height: 0 }

let clip = { left: 0, top: 0, right: 0, bottom: 0 }

function __get_ctx() {
  if (!ctx) {
    throw new Error("renderer not initialized")
  }
  return ctx
}

function __sync_canvas_size() {
  if (!canvas || !ctx) return

  let cssWidth = Math.floor(canvas.clientWidth)
  let cssHeight = Math.floor(canvas.clientHeight)
  if (cssWidth <= 0 || cssHeight <= 0) {
    const rect = canvas.getBoundingClientRect()
    cssWidth = Math.floor(rect.width)
    cssHeight = Math.floor(rect.height)
  }

  const dpr = typeof window !== "undefined" && window.devicePixelRatio ? window.devicePixelRatio : 1
  const scaledWidth = Math.max(1, Math.round(cssWidth * dpr))
  const scaledHeight = Math.max(1, Math.round(cssHeight * dpr))

  if (canvas.width !== scaledWidth) canvas.width = scaledWidth
  if (canvas.height !== scaledHeight) canvas.height = scaledHeight

  if (canvasSize.width !== scaledWidth || canvasSize.height !== scaledHeight || devicePixelRatio !== dpr) {
    canvasSize.width = scaledWidth
    canvasSize.height = scaledHeight
    devicePixelRatio = dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.imageSmoothingEnabled = false
  }
}

function __with_clip(clipRect: typeof clip, fn: () => void) {
  const ctx = __get_ctx()
  const w = clipRect.right - clipRect.left
  const h = clipRect.bottom - clipRect.top
  if (w <= 0 || h <= 0) return

  ctx.save()
  ctx.beginPath()
  ctx.rect(clipRect.left, clipRect.top, w, h)
  ctx.clip()
  fn()
  ctx.restore()
}

function __font_family_from_filename(filename: string) {
  const lower = filename.toLowerCase()
  if (lower.includes("icons")) return "lite-icons"
  if (lower.includes("monospace")) return "lite-monospace"
  return "lite-font"
}

function __apply_font(font: RenFont) {
  const ctx = __get_ctx()
  if (ctx.font !== font.__cssFont) {
    ctx.font = font.__cssFont
  }
  ctx.textAlign = "left"
  ctx.textBaseline = "top"
  if ("fontKerning" in ctx) {
    ;(ctx as any).fontKerning = "none"
  }
  if ("fontVariantLigatures" in ctx) {
    ;(ctx as any).fontVariantLigatures = "none"
  }
}

function __ensure_font_metrics(font: RenFont) {
  if (font.height > 0) return

  if (!ctx) {
    font.height = Math.floor(font.size + 0.5)
    return
  }

  __apply_font(font)
  const m = ctx.measureText("Mg")
  const ascent = "actualBoundingBoxAscent" in m ? (m as any).actualBoundingBoxAscent : font.size
  const descent = "actualBoundingBoxDescent" in m ? (m as any).actualBoundingBoxDescent : 0
  const h = ascent + descent
  font.height = Math.max(1, Math.floor(h + 0.5))
}

function __css_color(color: RenColor) {
  return `rgb(${color.r}, ${color.g}, ${color.b})`
}

function __measure_text(font: RenFont, text: string) {
  if (!ctx) return Math.floor(text.length * (font.size / 2) + 0.5)
  __apply_font(font)
  return ctx.measureText(text).width
}

function __measure_with_tabs(font: RenFont, text: string) {
  let w = 0
  let start = 0
  for (let i = 0; i < text.length; ) {
    const codepoint = text.codePointAt(i)!
    const next = i + (codepoint > 0xffff ? 2 : 1)
    if (codepoint === 9 || codepoint === 10) {
      if (start < i) w += __measure_text(font, text.slice(start, i))
      if (codepoint === 9) w += font.tab_width
      start = next
    }
    i = next
  }
  if (start < text.length) w += __measure_text(font, text.slice(start))
  return w
}

function ren_init(win: HTMLCanvasElement) {
  canvas = win
  ctx = win.getContext("2d", { alpha: true })
  if (!ctx) throw new Error("failed to get canvas 2d context")
  __sync_canvas_size()
  ren_set_clip_rect({ x: 0, y: 0, width: win.width / devicePixelRatio, height: win.height / devicePixelRatio })
}

function ren_update_rects(_rects: RenRect[], _count: number) {
  __sync_canvas_size()
}

function ren_set_clip_rect(rect: RenRect) {
  clip.left = rect.x
  clip.top = rect.y
  clip.right = rect.x + rect.width
  clip.bottom = rect.y + rect.height
}

function ren_get_size() {
  __sync_canvas_size()
  if (!canvas) return [0, 0] as const
  return [Math.floor(canvas.width / devicePixelRatio), Math.floor(canvas.height / devicePixelRatio)] as const
}

function ren_new_image(width: number, height: number) {
  if (!(width > 0 && height > 0)) {
    throw new Error("invalid image size")
  }
  const imageData = new ImageData(width, height)
  const image: RenImage = {
    pixels: imageData.data,
    width,
    height,
    __imageData: imageData,
  }
  return image
}

function ren_free_image(_image: RenImage) {}

function ren_load_font(filename: string, size: number) {
  const family = __font_family_from_filename(filename)
  const font: RenFont = {
    filename,
    size,
    height: 0,
    tab_width: 0,
    __family: family,
    __cssFont: `${size}px "${family}"`,
  }

  __ensure_font_metrics(font)
  if (!font.tab_width) {
    font.tab_width = Math.floor(__measure_text(font, " ") * 4 + 0.5)
  }

  return font
}

function ren_free_font(_font: RenFont) {}

function ren_set_font_tab_width(font: RenFont, n: number) {
  font.tab_width = n
}

function ren_get_font_tab_width(font: RenFont) {
  return font.tab_width
}

function ren_get_font_width(font: RenFont, text: string) {
  __sync_canvas_size()
  __ensure_font_metrics(font)
  if (!font.tab_width) {
    font.tab_width = Math.floor(__measure_text(font, " ") * 4 + 0.5)
  }
  const w = __measure_with_tabs(font, text)
  return Math.floor(w + 0.5)
}

function ren_get_font_height(font: RenFont) {
  __sync_canvas_size()
  __ensure_font_metrics(font)
  return font.height
}

function ren_draw_rect(rect: RenRect, color: RenColor) {
  if (color.a === 0) return
  __sync_canvas_size()
  const ctx = __get_ctx()

  __with_clip(clip, () => {
    ctx.save()
    ctx.globalAlpha = color.a / 255
    ctx.fillStyle = __css_color(color)
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
    ctx.restore()
  })
}

function ren_draw_image(image: RenImage, sub: RenRect, x: number, y: number, color: RenColor) {
  if (color.a === 0) return
  __sync_canvas_size()
  const ctx = __get_ctx()

  let n: number
  if ((n = clip.left - x) > 0) { sub.width -= n; sub.x += n; x += n }
  if ((n = clip.top - y) > 0) { sub.height -= n; sub.y += n; y += n }
  if ((n = x + sub.width - clip.right) > 0) { sub.width -= n }
  if ((n = y + sub.height - clip.bottom) > 0) { sub.height -= n }

  if (sub.width <= 0 || sub.height <= 0) return

  __with_clip(clip, () => {
    ctx.save()
    ctx.globalAlpha = color.a / 255
    ctx.putImageData(image.__imageData, x - sub.x, y - sub.y, sub.x, sub.y, sub.width, sub.height)
    ctx.restore()
  })
}

function ren_draw_text(font: RenFont, text: string, x: number, y: number, color: RenColor) {
  if (color.a === 0) return x
  __sync_canvas_size()
  __ensure_font_metrics(font)

  if (!font.tab_width) {
    font.tab_width = Math.floor(__measure_text(font, " ") * 4 + 0.5)
  }

  const ctx = __get_ctx()
  __apply_font(font)

  __with_clip(clip, () => {
    ctx.save()
    ctx.globalAlpha = color.a / 255
    ctx.fillStyle = __css_color(color)

    let start = 0
    for (let i = 0; i < text.length; ) {
      const codepoint = text.codePointAt(i)!
      const next = i + (codepoint > 0xffff ? 2 : 1)

      if (codepoint === 9 || codepoint === 10) {
        if (start < i) {
          const run = text.slice(start, i)
          ctx.fillText(run, x, y)
          x += __measure_text(font, run)
        }
        if (codepoint === 9) {
          x += font.tab_width
        }
        start = next
      }

      i = next
    }

    if (start < text.length) {
      const run = text.slice(start)
      ctx.fillText(run, x, y)
      x += __measure_text(font, run)
    }

    ctx.restore()
  })

  return Math.floor(x + 0.5)
}

export type { RenImage, RenFont, RenColor, RenRect }

export {
  MAX_GLYPHSET,
  ren_init,
  ren_update_rects,
  ren_set_clip_rect,
  ren_get_size,
  ren_new_image,
  ren_free_image,
  ren_load_font,
  ren_free_font,
  ren_set_font_tab_width,
  ren_get_font_tab_width,
  ren_get_font_width,
  ren_get_font_height,
  ren_draw_rect,
  ren_draw_image,
  ren_draw_text,
}
