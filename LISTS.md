# Rewrite Priority List

This list suggests the order for rewriting the `rxi/lite` project into TypeScript. The order is based on dependency analysis.

## Phase 1: Platform (C to TypeScript)
These files provide the foundation for rendering, system events, and Lua API simulation.

- [renderer.h](file:///c:/Projects/lite-js/orig/lite/src/renderer.h) & [renderer.c](file:///c:/Projects/lite-js/orig/lite/src/renderer.c) -> `src/platform/renderer.ts`
- [rencache.h](file:///c:/Projects/lite-js/orig/lite/src/rencache.h) & [rencache.c](file:///c:/Projects/lite-js/orig/lite/src/rencache.c) -> `src/platform/rencache.ts`
- [api/renderer.c](file:///c:/Projects/lite-js/orig/lite/src/api/renderer.c) -> `src/platform/api/renderer.ts`
- [api/system.c](file:///c:/Projects/lite-js/orig/lite/src/api/system.c) -> `src/platform/api/system.ts`
- [api/api.c](file:///c:/Projects/lite-js/orig/lite/src/api/api.c) -> `src/platform/api/api.ts`

## Phase 2: Core Lua Base (Low Dependency)
Basic utility modules that many others depend on.

- [common.lua](file:///c:/Projects/lite-js/orig/lite/data/core/common.lua) -> `src/data/core/common.ts`
- [config.lua](file:///c:/Projects/lite-js/orig/lite/data/core/config.lua) -> `src/data/core/config.ts`
- [strict.lua](file:///c:/Projects/lite-js/orig/lite/data/core/strict.lua) -> `src/data/core/strict.ts`
- [style.lua](file:///c:/Projects/lite-js/orig/lite/data/core/style.lua) -> `src/data/core/style.ts`
- [object.lua](file:///c:/Projects/lite-js/orig/lite/data/core/object.lua) (Reference for class mapping, not directly rewritten as a file but implemented as TS classes)

## Phase 3: Core Lua Logic
The main logic for document handling, input, and commands.

- [tokenizer.lua](file:///c:/Projects/lite-js/orig/lite/data/core/tokenizer.lua) -> `src/data/core/tokenizer.ts`
- [syntax.lua](file:///c:/Projects/lite-js/orig/lite/data/core/syntax.lua) -> `src/data/core/syntax.ts`
- [doc/init.lua](file:///c:/Projects/lite-js/orig/lite/data/core/doc/init.lua) -> `src/data/core/doc/init.ts`
- [view.lua](file:///c:/Projects/lite-js/orig/lite/data/core/view.lua) -> `src/data/core/view.ts`
- [command.lua](file:///c:/Projects/lite-js/orig/lite/data/core/command.lua) -> `src/data/core/command.ts`
- [keymap.lua](file:///c:/Projects/lite-js/orig/lite/data/core/keymap.lua) -> `src/data/core/keymap.ts`

## Phase 4: UI Components (Views)
UI-specific views that depend on `View` and other core modules.

- [docview.lua](file:///c:/Projects/lite-js/orig/lite/data/core/docview.lua) -> `src/data/core/docview.ts`
- [rootview.lua](file:///c:/Projects/lite-js/orig/lite/data/core/rootview.lua) -> `src/data/core/rootview.ts`
- [statusview.lua](file:///c:/Projects/lite-js/orig/lite/data/core/statusview.lua) -> `src/data/core/statusview.ts`
- [commandview.lua](file:///c:/Projects/lite-js/orig/lite/data/core/commandview.lua) -> `src/data/core/commandview.ts`
- [logview.lua](file:///c:/Projects/lite-js/orig/lite/data/core/logview.lua) -> `src/data/core/logview.ts`

## Phase 5: Entry Point
The main entry point that wires everything together.

- [init.lua](file:///c:/Projects/lite-js/orig/lite/data/core/init.lua) -> `src/data/core/init.ts`

## Phase 6: Commands and Extensions
Specific command implementations and doc helpers.

- `core/commands/`
  - [command.lua](file:///c:/Projects/lite-js/orig/lite/data/core/commands/command.lua)
  - [core.lua](file:///c:/Projects/lite-js/orig/lite/data/core/commands/core.lua)
  - [doc.lua](file:///c:/Projects/lite-js/orig/lite/data/core/commands/doc.lua)
  - [findreplace.lua](file:///c:/Projects/lite-js/orig/lite/data/core/commands/findreplace.lua)
  - [root.lua](file:///c:/Projects/lite-js/orig/lite/data/core/commands/root.lua)
- `core/doc/`
  - [highlighter.lua](file:///c:/Projects/lite-js/orig/lite/data/core/doc/highlighter.lua)
  - [search.lua](file:///c:/Projects/lite-js/orig/lite/data/core/doc/search.lua)
  - [translate.lua](file:///c:/Projects/lite-js/orig/lite/data/core/doc/translate.lua)
