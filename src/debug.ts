
type DebugSettings = {
  visible: boolean
  expanded: boolean
  showScene: boolean
  showCanvasText: boolean
  showEventLog: boolean
  showStatus: boolean
  showFilesystem: boolean
  showApiStatus: boolean
  enableCursorHover: boolean
  showDirtyDebugTint: boolean
}

const DEBUG_STORAGE_KEY = "lite-js:debug-overlay"

function loadDebugSettings(): DebugSettings {
  const defaults: DebugSettings = {
    visible: true,
    expanded: true,
    showScene: true,
    showCanvasText: false,
    showEventLog: true,
    showStatus: true,
    showFilesystem: true,
    showApiStatus: true,
    enableCursorHover: true,
    showDirtyDebugTint: true,
  }

  try {
    const raw = localStorage.getItem(DEBUG_STORAGE_KEY)
    if (!raw) return defaults
    const parsed = JSON.parse(raw) as Partial<DebugSettings>
    return { ...defaults, ...parsed }
  } catch {
    return defaults
  }
}

function saveDebugSettings(settings: DebugSettings) {
  try {
    localStorage.setItem(DEBUG_STORAGE_KEY, JSON.stringify(settings))
  } catch {}
}

function createDebugOverlay(settings: DebugSettings, onChange: (next: DebugSettings) => void) {
  const root = document.createElement("div")
  root.style.position = "fixed"
  root.style.right = "12px"
  root.style.top = "12px"
  root.style.zIndex = "9999"
  root.style.maxWidth = "420px"
  root.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
  root.style.fontSize = "12px"
  root.style.lineHeight = "1.35"
  root.style.color = "#e8e8e8"
  root.style.background = "rgba(0, 0, 0, 0.78)"
  root.style.border = "1px solid rgba(255, 255, 255, 0.15)"
  root.style.borderRadius = "8px"
  root.style.padding = "10px"
  root.style.pointerEvents = "auto"
  root.style.display = settings.visible ? "block" : "none"

  const header = document.createElement("div")
  header.style.display = "flex"
  header.style.alignItems = "center"
  header.style.justifyContent = "space-between"
  header.style.gap = "8px"

  const title = document.createElement("div")
  title.textContent = "Debug Overlay"
  title.style.fontWeight = "600"

  const controls = document.createElement("div")
  controls.style.display = "flex"
  controls.style.alignItems = "center"
  controls.style.gap = "6px"

  const btnCollapse = document.createElement("button")
  btnCollapse.textContent = settings.expanded ? "Hide" : "Show"
  btnCollapse.style.cursor = "pointer"
  btnCollapse.style.border = "1px solid rgba(255,255,255,0.25)"
  btnCollapse.style.borderRadius = "6px"
  btnCollapse.style.padding = "4px 8px"
  btnCollapse.style.background = "rgba(255,255,255,0.08)"
  btnCollapse.style.color = "inherit"

  const btnClose = document.createElement("button")
  btnClose.textContent = "Off"
  btnClose.style.cursor = "pointer"
  btnClose.style.border = "1px solid rgba(255,255,255,0.25)"
  btnClose.style.borderRadius = "6px"
  btnClose.style.padding = "4px 8px"
  btnClose.style.background = "rgba(255,255,255,0.08)"
  btnClose.style.color = "inherit"

  controls.appendChild(btnCollapse)
  controls.appendChild(btnClose)
  header.appendChild(title)
  header.appendChild(controls)

  const body = document.createElement("div")
  body.style.marginTop = "10px"
  body.style.display = settings.expanded ? "block" : "none"

  const makeRow = () => {
    const row = document.createElement("div")
    row.style.display = "flex"
    row.style.alignItems = "center"
    row.style.justifyContent = "space-between"
    row.style.gap = "12px"
    row.style.margin = "4px 0"
    return row
  }

  const makeToggle = (key: keyof DebugSettings, label: string) => {
    const row = makeRow()
    const left = document.createElement("div")
    left.textContent = label
    left.style.opacity = "0.95"

    const input = document.createElement("input")
    input.type = "checkbox"
    input.checked = Boolean(settings[key])
    input.addEventListener("change", () => {
      const next = { ...settings, [key]: input.checked }
      onChange(next)
    })

    row.appendChild(left)
    row.appendChild(input)
    return row
  }

  const status = document.createElement("div")
  status.style.marginTop = "8px"
  status.style.paddingTop = "8px"
  status.style.borderTop = "1px solid rgba(255, 255, 255, 0.15)"
  status.style.whiteSpace = "pre-wrap"
  status.style.wordBreak = "break-word"

  const events = document.createElement("div")
  events.style.marginTop = "8px"
  events.style.paddingTop = "8px"
  events.style.borderTop = "1px solid rgba(255, 255, 255, 0.15)"

  const eventsTitle = document.createElement("div")
  eventsTitle.textContent = "Events"
  eventsTitle.style.fontWeight = "600"
  eventsTitle.style.marginBottom = "6px"

  const eventsBody = document.createElement("div")
  eventsBody.style.maxHeight = "160px"
  eventsBody.style.overflow = "auto"
  eventsBody.style.whiteSpace = "pre"
  eventsBody.style.border = "1px solid rgba(255,255,255,0.15)"
  eventsBody.style.borderRadius = "6px"
  eventsBody.style.padding = "6px"
  eventsBody.style.background = "rgba(0,0,0,0.25)"

  events.appendChild(eventsTitle)
  events.appendChild(eventsBody)

  body.appendChild(makeToggle("showDirtyDebugTint", "Dirty Debug Tint (rencache)"))
  body.appendChild(makeToggle("showStatus", "Status Panel"))
  body.appendChild(makeToggle("showFilesystem", "Filesystem Info"))
  body.appendChild(makeToggle("showApiStatus", "API Status"))
  body.appendChild(makeToggle("showEventLog", "Event Log"))
  body.appendChild(makeToggle("enableCursorHover", "Cursor Hover Test"))
  body.appendChild(makeToggle("showScene", "Scene Demo"))
  body.appendChild(makeToggle("showCanvasText", "Canvas Text Stress"))
  body.appendChild(status)
  body.appendChild(events)

  btnCollapse.addEventListener("click", () => {
    const next = { ...settings, expanded: !settings.expanded }
    onChange(next)
  })

  btnClose.addEventListener("click", () => {
    const next = { ...settings, visible: false }
    onChange(next)
  })

  root.appendChild(header)
  root.appendChild(body)

  const apply = (next: DebugSettings) => {
    root.style.display = next.visible ? "block" : "none"
    body.style.display = next.expanded ? "block" : "none"
    btnCollapse.textContent = next.expanded ? "Hide" : "Show"
    settings = next
    const inputs = Array.from(root.querySelectorAll("input[type=checkbox]")) as HTMLInputElement[]
    const keys: Array<keyof DebugSettings> = [
      "showDirtyDebugTint",
      "showStatus",
      "showFilesystem",
      "showApiStatus",
      "showEventLog",
      "enableCursorHover",
      "showScene",
      "showCanvasText",
    ]
    for (let i = 0; i < Math.min(inputs.length, keys.length); i++) {
      inputs[i].checked = Boolean(settings[keys[i]])
    }
  }

  const update = (info: { statusText: string; eventLines: string[] }) => {
    status.textContent = info.statusText
    events.style.display = settings.showEventLog ? "block" : "none"
    if (settings.showEventLog) {
      eventsBody.textContent = info.eventLines.join("\n")
    }
  }

  return { root, apply, update, getSettings: () => settings }
}

export { createDebugOverlay, loadDebugSettings, saveDebugSettings, type DebugSettings };