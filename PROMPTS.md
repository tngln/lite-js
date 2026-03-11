
这个项目的目标是把 `rxi/lite`，一个基于 C 语言、SDL 和 Lua 的原生代码编辑器，使用 TypeScript 重写，并且使其运行在浏览器中。
项目已经配置好了 Bun 环境。也就是说，不需要考虑打包，使用 `bun src/index.html` 可以直接在浏览器中运行项目。使用 `bun -e` 可以简单地测试代码。
在本地运行的脚本中，我们也可以确保使用 Bun 环境提供的可能功能。

# 项目结构

在 `/orig/lite` 目录下，包含了 `rxi/lite` 的原始代码。这些原始代码将不会需要任何变更。其中：

* `/orig/lite/src` 目录下包含了 `rxi/lite` 的原始 C 代码。这些代码主要用以提供平台功能。
* `/orig/lite/data` 目录下包含了 `rxi/lite` 的 Lua 代码和其他运行时数据。我们只关注其中的 Lua 代码。

# 怎样进行重写

我们将逐文件地进行重写。每次，我们将通过对大语言模型的调用，实现对一个具体文件和功能的重写。
重写后的文件，将被放置在 `src` 文件夹内。

* 如果是 C 代码，它将放置在 `src` 目录下。
* 如果是 Lua 代码，它将放置在 `src/data` 目录下，其目录结构参照 `orig/lite/data`。

## 原则

在整个重写过程中，我们将会确保：

* 我们将在重写过程中保持一致的命名。包括内部变量在内的全部 identifier 都将保持不变，它们的 camelCase 命名风格将同样被完全保留，即便它并不符合 TypeScript 的命名习惯。

* 我们将在重写过程中，保持原有的代码顺序不变。如果一个函数被放置在文件的顶部，那么它在重写后的文件中也将被放置在顶部。

* 我们将在重写过程中，保持现有 TypeScript 代码风格一致：2 空格缩进、双引号字符串、尽量不使用分号；除非某个文件已有明确不同风格。

* 我们在 TypeScript 中将使用 ES Module：`import` / `export`，避免自定义打包与运行时魔法，确保 `bun src/index.html` 可以直接跑起来。

* 我们只做等价转写与必要的“平台替换”，不做重构、性能优化或行为改动；如果某个原功能在浏览器不可用，优先给出语义等价的降级实现，并保持调用点与返回值形状稳定。

* 我们不会无端新增注释：原始注释必须保留；只有当转写会导致语义不清或需要解释 Lua/SDL 到 Web 的替代点时，才补充最少量中文注释。

## 关于 C 代码

这部分主要覆盖 `orig/lite/src` 下的 SDL/C 实现（渲染、渲染缓存、系统层 API），目标是在浏览器环境用 TypeScript + Canvas API 复刻结构与行为边界。

### 文件映射

为了区分 C 来源的 TypeScript 代码和 Lua 来源的代码，我们将在 `src` 目录下，新增一个 `platform` 子目录，用以承载相关的平台功能和系统层 API。

* `orig/lite/src/renderer.h, renderer.c` → `src/platform/renderer.ts`
* `orig/lite/src/rencache.h, rencache.c` → `src/platform/rencache.ts`
* `orig/lite/src/api/*` → `src/api/*.ts`

### 类型与结构约定

* `struct` / `typedef`：优先转成 `type` / `interface`，字段名保持不变；如果原代码依赖“按值复制”语义，则用 plain object 并在写入点显式拷贝。
* `enum` / `#define` 常量：转成 `const` 常量；名称保持不变；表达式按原优先级写清楚。
* 指针与缓冲区：
  * “指向像素/字节缓冲区”的指针优先映射为 `Uint8Array` / `Uint32Array` / `ImageData`（按实际使用选择）。
  * “可增长命令缓冲区”（如 `rencache.c` 的 `command_buf`）优先映射为 `Command[]`（结构化对象数组）；仅当确实需要二进制布局时才使用 `ArrayBuffer`。
* 内存管理：
  * `malloc/free` 语义在 TS 中由 GC 处理；但如果原代码通过“显式释放”触发行为（例如 `rencache_free_font`），则保留等价的生命周期事件（例如在缓存里标记待释放并在帧末处理）。

### Canvas/事件替代约定

* SDL Window 尺寸：由 `canvas.width/height`（注意 DPR）决定；所有坐标保持与 `SCALE` 规则一致。
* 渲染：
  * `ren_draw_rect` → `CanvasRenderingContext2D.fillRect`
  * `ren_draw_text` → `fillText`，并保留 `tab_width`、字体高度/宽度相关接口（必要时用测量与缓存实现）
  * `ren_set_clip_rect` → `ctx.save()` + `ctx.beginPath()` + `ctx.rect()` + `ctx.clip()` + `ctx.restore()` 的栈式管理；对应 Lua 侧 `core.push_clip_rect` / `pop_clip_rect` 的调用关系要保持
* 输入与系统：
  * `system.poll_event` / `wait_event`：用浏览器事件队列模拟；需要保持“事件类型字符串 + 参数列表”的形状与顺序
  * 文件系统：按既定目标使用 Origin Private File System API（OPFS）模拟 `list_dir/get_file_info/absolute_path` 等接口；在无法实现的地方，返回 `null`/`undefined` 或抛错的策略要与 Lua 调用点一致

## 关于 Lua 代码

我们的核心工作将是转写 Lua 代码。考虑到 Lua 和 JavaScript 同样是 Prototype-based 的语言，我们将尽可能追求代码被逐行翻译的结果。

一系列任务将被创建，用以进行这种转写。

* 首先，我们将会读取一个具体的 Lua 文件。
* 我们将会根据 Lua 代码的具体内容，将其等价地翻译成对应的 TypeScript 代码。
* 对于类型的定义，将会通过具体的上下文得到推断；这些类型将用作对于代码生成质量的校验。它们将被放置在生成代码文件的顶部。
* 一些面向对象的基础实现，体现在 `orig/lite/data/core/object.lua` 中。在 TypeScript 中，我们可以使用类来实现这些功能，因而它是不必要的。
* Lua 的模式匹配，将会被重写为 JavaScript 的正则表达式。
* 其他针对 Lua → TypeScript 的转写约定如下，必须统一执行。
* 各种意义上，我们都很有可能需要新建其他的函数或者变量，用以抹平不同平台之间的差异。为了区分，这些新建的函数或者变量，都应该使用双下划线开头的命名方式。例如 `__platform_specific_function`。
* 任何需要导出的接口，都不应该直接声明为 `export function` 或者 `export const`，而是在文件结尾通过 `export { ... }` 导出。
* 最后，我们将在重写后的文件中，添加必要的注释。原始的注释将得到逐行地保留。
* 我们将把完成的进度追加到 `rewriter/rewriter.json` 中。具体参见下面的说明。同时，我们将在 `GENERATED_HISTORY.md` 中，记录必要的信息。
* 在提供单个文件的过程中，我们将会在别的文件中引入的各种符号（变量、函数等）。这些符号都应该被额外定义到对应的文件中，但并不实现，而是等待后续的处理。

### 模块与导入导出（对应 Lua `require`）

* Lua 侧 `local x = require "core.common"`：
  * TypeScript 侧使用 `import x from "./common"`（相对路径以生成文件位置为基准），并保持 `x` 变量名不变。

### 全局变量与 `_G` / `strict`（对应 `core/strict.lua`）

* `core/strict.lua` 通过 `global({ ... })` 写入 `_G` 并禁止未定义全局读写。
* TypeScript 侧约定：
  * 不把变量写到真实的 `globalThis`，而是建立一个显式的 `G` 对象（或同名模块导出对象）承载“原本的全局”。
  * `global({ k = v })` → `Object.assign(G, { k: v })`（键名保持不变）。
  * 原本由 C 侧注入的全局（`ARGS`、`VERSION`、`PLATFORM`、`SCALE`、`EXEFILE`、`EXEDIR`、`PATHSEP`）在 Web 侧同样以 `G` 字段提供；含义不变，值来源替换为浏览器环境的等价物（例如 `PATHSEP` 固定为 `"/"`，`EXEDIR` 可设为 `"/"` 或虚拟根）。

### 类与方法（对应 `core/object.lua` 的 `extend/super/__call` 习惯）

Lua 中大量使用：
* `local X = Y:extend()`
* `function X:new(...) ... end`
* `function X:method(...) ... end`
* `X.super.method(self, ...)`（显式调用父类实现）
* `X()`（依赖 `__call` 作为构造器）

TypeScript 侧统一映射为：
* `local X = Y:extend()` → `class X extends Y { ... }`
* `function X:new(a, b)` → `constructor(a, b) { super(...必要时); ... }`
* 冒号方法 `X:method(a)` → 实例方法 `method(a)`（`self` → `this`）
* `X.super.foo(self, ...)` → 在 `X` 的方法内部用 `super.foo(...)`
* `X()` → `new X()`（把“构造调用点”显式化）
* `Base.method(self, ...)`（例如 `View.get_name(self)` 这种绕过虚派发的调用）：
  * TypeScript 侧用 `Base.prototype.method.call(this, ...)` 保持“指定实现”的语义

### Table、数组、`ipairs/pairs` 与 1-based 约定

Lite 的 Lua 代码大量依赖 1-based 数组（例如 `doc.lines[1]`、`for i = 1, #t do`、`ipairs(t)`）。
TypeScript 侧统一约定：
* 对应 Lua 的“数组表”，用 `T[]` 表示，但保持 1-based：下标 0 留空（可放 `undefined` 占位）。
* `#t` 的等价物不是 `t.length`，而是 `t.length - 1`（因为 `length` 统计到最大下标）。
* `ipairs(t)`：
  * 仅遍历从 1 开始的连续整数键，直到遇到 `nil`/空洞为止；不要用 `for...of` 直接遍历（会跳过空洞语义差异），应使用显式 `for (let i = 1; i <= ...; i++)`。
* `pairs(t)`：
  * 需要同时覆盖数组与对象键。建议约定：数组段仍按 1..n 顺序遍历；非数字键用 `for (const k in obj)`/`Object.keys` 处理，并明确是否要包含原型链（默认不包含）。

### 多返回值、可变参数与 `math.huge`

* Lua 多返回值（例如 `return x, y, w, h`）：
  * TypeScript 侧优先用元组 `return [x, y, w, h] as const` 并在调用点解构；若调用点期望“只取第一个返回值”，则保持为单值返回并在需要时引入辅助函数（避免全局性大改）。必要的类型重载同样需要添加。
* `...`（varargs）→ `...args: any[]`，并保持 `select("#", ...)`、`{...}` 这类用法语义一致。
* `math.huge` → `Infinity`。

### 字符串、Lua pattern 与 `gsub/gmatch/find`

* `string.find` / `:find`：
  * 注意 Lua `find(text, pattern, init, plain)` 的 `plain` 参数；若 Lua 代码传了 `true` 表示“纯字符串查找”，TypeScript 必须用 `indexOf/includes` 或转义后的正则。
* Lua pattern → JS RegExp：
  * 不能机械替换：Lua 的 `%` 转义与字符类语义不同；必须在转写时按“当前 pattern 的实际用法”逐个对照改写。
  * 常见等价（仅作方向，具体以代码为准）：
    * `"%s"` → `\\s`
    * `"%S"` → `\\S`
    * `"^%s*$"` → `/^\\s*$/`
    * `"%.lua$"` → `/\.lua$/`
* `:gsub(pat, repl)`：
  * 若 `repl` 是函数，TypeScript 用 `str.replace(regex, (...m) => ...)`；若要全局替换，必须加 `g` 标志。
* `:gmatch(pat)`：
  * TypeScript 侧用 `RegExp.prototype.exec` 循环或 `matchAll`（注意兼容性与捕获组行为），并保持迭代顺序与捕获值一致。

### 简单对象

* 代码中存在大量类似 `data/core/common.lua` 中的，先定义一个空对象 `local common = {}` 再用 `common.is_utf8_cont = function() ... end` 定义方法的行为：
  * 不能机械地替换成 `const common = {}`，这样会使得类型推导丧失意义。我们将会把整个对象通过闭包包装起来：
  
  ```
  let common = (() => {
    function is_utf8_cont() {};

    return { is_utf8_cont };
  })();
  ```
这将是我们提倡的方法。这将有效解决局部符号的问题。如果整个对象比较简单，不包括局部的函数，我们可以直接用 `const common = { is_utf8_cont(){...} }` 来定义。

## 关于平台功能

`rxi/lite` 本身使用了 SDL 来提供系统层面的功能。其中包括这样一些功能：

* 渲染功能。这些功能可以将会直接使用 Canvas API。
* 输入功能。这些功能可以直接使用浏览器的事件系统。
* 文件管理功能。我们将使用 Origin Private File System API，来模拟一套文件系统 API。
* 渲染缓存。我们将使用 TypeScript 重写这个渲染缓存。我们的目标不是高性能，而是保留原有的结构。

# Rewriter

考虑到 `rxi/lite` 并没有提供测试框架和相关代码，为了标注我们的进度，我们将使用一个简单的 rewriter 进行进度统计。
它将以行、块和函数作为基本单位，提供一个界面，用以检查每个单位是否已经被重写成 JavaScript，并且经人工检查是否存在问题。

`rewriter/rewriter.json` 是 rewriter 的数据文件。每次进行重写后，都需要在这个文件中更新进度，通过追加一个新的元素。

* `task` 字段是一个字符串，代表当前任务的名称；名称只需要包含日期和任务序号，例如 `2025-12-30 #1`。
* `from` 字段是原始 Lua 文件的路径。
* `to` 字段是重写后的 TypeScript 文件的路径。
* `finished` 字段是一个二维数组，每个元素是一个区间，代表该区间的行已经被重写完成。当整个文件都被重写完成后，它将被设置为 `true`。也就是说，它的类型是 `[number, number][] | boolean`。
* `checked` 字段是一个二维数组，每个元素是一个区间，代表该区间的行已经被人工检查过。当每个任务运行完毕时，它将被设置为 `false`。
* `additionalSymbols` 对应着不包括在当前文件中，但是因为有必要，所以被临时生成的占位符。它将是一个由路径和占位符数组组成的 Key-Value 对。如果来源是未知的，路径将是 `UNKNOWN`。

`rewriter` 目录下的其他文件无需考虑。它们服务于一个已经完成的、用以统计进度的简单系统。

# GENERATED_HISTORY.md

每次生成完成后，我们将在 `GENERATED_HISTORY.md` 中追加一个新的条目，记录下生成的时间、任务名称、以及生成的文件路径，以及其他可供参考的文本信息。
它同样应该包括上述的日期和任务序号。除此之外，内容是不限的，它只需要可读地表达出当前已经作业的内容即可。
每次生成前，这个文件中的内容将被用作参考。