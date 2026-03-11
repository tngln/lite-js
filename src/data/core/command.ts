import type { Core } from "./index"

// core is imported lazily to avoid circular deps
function __get_core(): Core {
  return (globalThis as any).__lite_core as Core
}

let command = (() => {
  type CommandEntry = {
    predicate: () => boolean
    perform: () => void
  }

  const map: Record<string, CommandEntry> = {}

  const always_true = () => true

  function add(predicate: any, cmd_map: Record<string, () => void>) {
    let pred: () => boolean = always_true
    if (predicate === null || predicate === undefined) {
      pred = always_true
    } else if (typeof predicate === "function") {
      pred = predicate
    } else if (typeof predicate === "string") {
      // predicate is a module name — load it lazily
      // In TS context, we use class predicate pattern
      pred = always_true
    } else if (typeof predicate === "object" && predicate !== null) {
      // predicate is a class
      const cls = predicate
      pred = () => __get_core().active_view instanceof cls
    }
    for (const name in cmd_map) {
      if (map[name]) {
        throw new Error("command already exists: " + name)
      }
      map[name] = { predicate: pred, perform: cmd_map[name] }
    }
  }

  function capitalize_first(str: string) {
    return str.charAt(0).toUpperCase() + str.slice(1)
  }

  function prettify_name(name: string) {
    return name
      .replace(/:/g, ": ")
      .replace(/-/g, " ")
      .replace(/\S+/g, capitalize_first)
  }

  function get_all_valid(): string[] {
    const res: string[] = []
    for (const name in map) {
      if (map[name].predicate()) {
        res.push(name)
      }
    }
    return res
  }

  function perform_one(name: string): boolean {
    const cmd = map[name]
    if (cmd && cmd.predicate()) {
      cmd.perform()
      return true
    }
    return false
  }

  function perform(name: string): boolean {
    const [ok, res] = __get_core().try(perform_one, name)
    return !ok || Boolean(res)
  }

  function add_defaults() {
    // Command modules self-register when imported; this is handled in init.ts
    // Nothing to do here since commands are imported as side effects
  }

  return { map, add, prettify_name, get_all_valid, perform, add_defaults }
})()

export { command }
export default command
