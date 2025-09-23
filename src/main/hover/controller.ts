import type { BrowserWindow } from 'electron'
import type { HoverMode } from './position'
import { screen } from 'electron'
import { ensureMiniWindow } from '../windows/windowManager'
import { buildHoverWindow } from './HoverWindow'
import { computeHoverPosition } from './position'
import { HoverRelay } from './relay'

let hoverWin: BrowserWindow | null = null
const relay = new HoverRelay()
// keep local state if needed in future; currently unused but removed to satisfy linter

export function ensureHoverWindow(): BrowserWindow {
  if (!hoverWin) {
    hoverWin = buildHoverWindow()
    hoverWin.on('closed', () => {
      relay.stop()
      hoverWin = null
    })
  }
  return hoverWin
}

export function show(): void {
  const mini = ensureMiniWindow()
  const hover = ensureHoverWindow()
  const miniBounds = mini.getBounds()
  const work = screen.getDisplayMatching(miniBounds).workArea
  const [w, h] = hover.getSize()
  const pos = computeHoverPosition(miniBounds, { width: w, height: h }, work)
  hover.setPosition(pos.x, pos.y)
  hover.showInactive()
  hover.moveTop()
  try {
    hover.webContents.send('hover:orientation', { mode: pos.mode as HoverMode })
  }
  catch {}
}

export function hide(): void {
  if (!hoverWin)
    return
  relay.stop()
  hoverWin.hide()
}

export function reposition(): void {
  const mini = ensureMiniWindow()
  const hover = ensureHoverWindow()
  if (!hover.isVisible())
    return
  const miniBounds = mini.getBounds()
  const work = screen.getDisplayMatching(miniBounds).workArea
  const [w, h] = hover.getSize()
  const pos = computeHoverPosition(miniBounds, { width: w, height: h }, work)
  hover.setPosition(pos.x, pos.y)
  try {
    hover.webContents.send('hover:orientation', { mode: pos.mode as HoverMode })
  }
  catch {}
}

export function onMiniEnter(): void {
  relay.stop()
  show()
}

export function onMiniLeave(): void {
  const mini = ensureMiniWindow()
  const hover = ensureHoverWindow()
  if (!hover.isVisible())
    return
  relay.start(mini.getBounds(), hover.getBounds(), () => {}, () => hide())
}

export function onHoverEnter(): void {
  relay.stop()
}

export function onHoverLeave(): void {
  const mini = ensureMiniWindow()
  const hover = ensureHoverWindow()
  if (!hover.isVisible())
    return
  relay.start(mini.getBounds(), hover.getBounds(), () => {}, () => hide())
}
