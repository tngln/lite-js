import type { Core } from "../index"
import style from "../style"
import { DocView } from "../docview"
import command from "../command"
import common from "../common"

function __get_core(): Core {
  return (globalThis as any).__lite_core as Core
}

const t: Record<string, () => void> = {
  ["root:close"]: function() {
    const core = __get_core()
    const node = core.root_view.get_active_node()
    node.close_active_view(core.root_view.root_node)
  },

  ["root:switch-to-previous-tab"]: function() {
    const core = __get_core()
    const node = core.root_view.get_active_node()
    const idx = node.get_view_idx(core.active_view)!
    const new_idx = idx - 1 < 1 ? node.views.length : idx - 1
    node.set_active_view(node.views[new_idx - 1])
  },

  ["root:switch-to-next-tab"]: function() {
    const core = __get_core()
    const node = core.root_view.get_active_node()
    const idx = node.get_view_idx(core.active_view)!
    const new_idx = idx + 1 > node.views.length ? 1 : idx + 1
    node.set_active_view(node.views[new_idx - 1])
  },

  ["root:move-tab-left"]: function() {
    const core = __get_core()
    const node = core.root_view.get_active_node()
    const idx = node.get_view_idx(core.active_view)!
    if (idx > 1) {
      node.views.splice(idx - 1, 1)
      node.views.splice(idx - 2, 0, core.active_view)
    }
  },

  ["root:move-tab-right"]: function() {
    const core = __get_core()
    const node = core.root_view.get_active_node()
    const idx = node.get_view_idx(core.active_view)!
    if (idx < node.views.length) {
      node.views.splice(idx - 1, 1)
      node.views.splice(idx, 0, core.active_view)
    }
  },

  ["root:shrink"]: function() {
    const core = __get_core()
    const node = core.root_view.get_active_node()
    const parent = node.get_parent_node(core.root_view.root_node)!
    const n = (parent.a === node) ? -0.1 : 0.1
    parent.divider = common.clamp(parent.divider + n, 0.1, 0.9)
  },

  ["root:grow"]: function() {
    const core = __get_core()
    const node = core.root_view.get_active_node()
    const parent = node.get_parent_node(core.root_view.root_node)!
    const n = (parent.a === node) ? 0.1 : -0.1
    parent.divider = common.clamp(parent.divider + n, 0.1, 0.9)
  },
}

for (let i = 1; i <= 9; i++) {
  t[`root:switch-to-tab-${i}`] = (function(n) {
    return function() {
      const core = __get_core()
      const node = core.root_view.get_active_node()
      const view = node.views[n - 1]
      if (view) {
        node.set_active_view(view)
      }
    }
  })(i)
}

for (const dir of ["left", "right", "up", "down"]) {
  t[`root:split-${dir}`] = (function(d) {
    return function() {
      const core = __get_core()
      const node = core.root_view.get_active_node()
      const av = node.active_view
      node.split(d)
      if (av instanceof DocView) {
        core.root_view.open_doc((av as DocView).doc)
      }
    }
  })(dir)

  t[`root:switch-to-${dir}`] = (function(d) {
    return function() {
      const core = __get_core()
      const node = core.root_view.get_active_node()
      let x: number, y: number
      if (d === "left" || d === "right") {
        y = node.position.y + node.size.y / 2
        x = node.position.x + (d === "left" ? -1 : node.size.x + style.divider_size)
      } else {
        x = node.position.x + node.size.x / 2
        y = node.position.y + (d === "up" ? -1 : node.size.y + style.divider_size)
      }
      const target = core.root_view.root_node.get_child_overlapping_point(x, y)
      if (!target.get_locked_size()) {
        core.set_active_view(target.active_view)
      }
    }
  })(dir)
}

command.add(function() {
  const core = __get_core()
  const node = core.root_view.get_active_node()
  return !node.get_locked_size()
}, t)
