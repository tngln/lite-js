type GType = Record<string, unknown>

const G: GType = {
  SCALE: (typeof window !== "undefined" && window.devicePixelRatio) ? window.devicePixelRatio : 1,
  PATHSEP: "/",
  EXEDIR: "/",
  EXEFILE: "/lite",
  PLATFORM: "Web",
  VERSION: "1.11",
  ARGS: [],
}

export type { GType }
export { G }
