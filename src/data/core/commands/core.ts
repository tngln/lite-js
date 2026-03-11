import type { Core } from "../index"
import common from "../common"
import command from "../command"
import keymap from "../keymap"
import { LogView } from "../logview"
import * as system from "../../../api/system"
import { G } from "../../../G"

function __get_core(): Core {
  return (globalThis as any).__lite_core as Core
}

let fullscreen = false

command.add(null, {
  ["core:quit"]: function() {
    __get_core().quit()
  },

  ["core:force-quit"]: function() {
    __get_core().quit(true)
  },

  ["core:toggle-fullscreen"]: function() {
    fullscreen = !fullscreen
    system.set_window_mode(fullscreen ? "fullscreen" : "normal")
  },

  ["core:reload-module"]: function() {
    const core = __get_core()
    core.command_view.enter("Reload Module", function(text: string, item: any) {
      const t = item ? item.text : text
      core.reload_module(t)
      core.log("Reloaded module %q", t)
    }, function(_text: string) {
      return [undefined]
    })
  },

  ["core:find-command"]: function() {
    const core = __get_core()
    const commands = command.get_all_valid()
    core.command_view.enter("Do Command", function(_text: string, item: any) {
      if (item) {
        command.perform(item.command)
      }
    }, function(text: string) {
      const res = common.fuzzy_match(commands, text) as any[]
      const out: any[] = [undefined]
      for (let i = 1; i <= res.length - 1; i++) {
        const name = res[i]
        out.push({
          text: command.prettify_name(name),
          info: keymap.get_binding(name),
          command: name,
        })
      }
      return out
    })
  },

  ["core:find-file"]: function() {
    const core = __get_core()
    core.command_view.enter("Open File From Project", function(text: string, item: any) {
      const t = item ? item.text : text
      core.root_view.open_doc(core.open_doc(t))
    }, function(text: string) {
      const files: any[] = [undefined]
      for (let i = 0; i < core.project_files.length; i++) {
        const item = core.project_files[i]
        if (item && item.type === "file") {
          files.push(item.filename)
        }
      }
      return common.fuzzy_match(files, text) as any[]
    })
  },

  ["core:new-doc"]: function() {
    const core = __get_core()
    core.root_view.open_doc(core.open_doc())
  },

  ["core:open-file"]: function() {
    const core = __get_core()
    core.command_view.enter("Open File", function(text: string) {
      core.root_view.open_doc(core.open_doc(text))
    }, common.path_suggest)
  },

  ["core:open-log"]: function() {
    const core = __get_core()
    const node = core.root_view.get_active_node()
    node.add_view(new LogView())
  },

  ["core:open-user-module"]: function() {
    const core = __get_core()
    const EXEDIR = G["EXEDIR"] as string || "/"
    core.root_view.open_doc(core.open_doc(EXEDIR + "/data/user/init.lua"))
  },

  ["core:open-project-module"]: function() {
    const core = __get_core()
    const filename = ".lite_project.lua"
    if (system.get_file_info(filename)) {
      core.root_view.open_doc(core.open_doc(filename))
    } else {
      const doc = core.open_doc()
      core.root_view.open_doc(doc)
      doc.save(filename)
    }
  },
})
