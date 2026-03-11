import type { Core } from "../index"
import command from "../command"
import { CommandView } from "../commandview"

function __get_core(): Core {
  return (globalThis as any).__lite_core as Core
}

function has_commandview() {
  return __get_core().active_view instanceof CommandView
}

command.add(has_commandview, {
  ["command:submit"]: function() {
    ;(__get_core().active_view as CommandView).submit()
  },

  ["command:complete"]: function() {
    ;(__get_core().active_view as CommandView).complete()
  },

  ["command:escape"]: function() {
    ;(__get_core().active_view as CommandView).exit()
  },

  ["command:select-previous"]: function() {
    ;(__get_core().active_view as CommandView).move_suggestion_idx(1)
  },

  ["command:select-next"]: function() {
    ;(__get_core().active_view as CommandView).move_suggestion_idx(-1)
  },
})
