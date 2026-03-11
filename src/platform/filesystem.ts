type FileInfo = {
  modified: number
  size: number
  type: "file" | "dir" | null
}

type FsDir = {
  type: "dir"
  modified: number
  entries: Map<string, FsNode>
}

type FsFile = {
  type: "file"
  modified: number
  content: string
}

type FsNode = FsDir | FsFile

let cwd = "/"

function now_seconds() {
  return Date.now() / 1000
}

function make_dir(entries: [string, FsNode][] = []): FsDir {
  return { type: "dir", modified: now_seconds(), entries: new Map(entries) }
}

function make_file(content: string): FsFile {
  return { type: "file", modified: now_seconds(), content }
}

const root: FsDir = make_dir([
  ["README.md", make_file("lite-js dummy filesystem\n")],
  ["data", make_dir([
    ["notes.txt", make_file("This is a dummy file.\n")],
    ["plugins", make_dir([
      ["example.lua", make_file("return {}\n")],
    ])],
  ])],
  ["projects", make_dir([
    ["demo", make_dir([
      ["main.lua", make_file("print('hello')\n")],
      ["hello.txt", make_file("hello world\n")],
    ])],
  ])],
])

function __split(path: string) {
  return path.split("/").filter(Boolean)
}

function __normalize(path: string) {
  if (!path) return cwd
  if (path === ".") return cwd
  if (path === "/") return "/"

  let absolute = path.startsWith("/")
  const parts = __split(absolute ? path : `${cwd}/${path}`)

  const out: string[] = []
  for (const part of parts) {
    if (part === "." || part === "") continue
    if (part === "..") {
      out.pop()
      continue
    }
    out.push(part)
  }

  return `/${out.join("/")}`
}

function __get_node(path: string) {
  const abs = __normalize(path)
  if (abs === "/") return root

  let node: FsNode = root
  const parts = __split(abs)
  for (const part of parts) {
    if (node.type !== "dir") return null
    const next = node.entries.get(part)
    if (!next) return null
    node = next
  }
  return node
}

function fs_chdir(path: string) {
  const node = __get_node(path)
  if (!node || node.type !== "dir") {
    throw new Error("chdir() failed")
  }
  cwd = __normalize(path)
}

function fs_list_dir(path: string) {
  const node = __get_node(path)
  if (!node || node.type !== "dir") return null
  return Array.from(node.entries.keys())
}

function fs_absolute_path(path: string) {
  return __normalize(path)
}

function fs_get_file_info(path: string): FileInfo | null {
  const node = __get_node(path)
  if (!node) return null
  if (node.type === "file") {
    return { modified: node.modified, size: node.content.length, type: "file" }
  }
  return { modified: node.modified, size: node.entries.size, type: "dir" }
}

export {
  fs_chdir,
  fs_list_dir,
  fs_absolute_path,
  fs_get_file_info,
}

