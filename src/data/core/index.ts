type Core = {
  init: () => void
  run: () => void
  on_error?: (err: unknown) => void
}

const core: Core = {
  init() {},
  run() {},
}

export type { Core }
export { core }

