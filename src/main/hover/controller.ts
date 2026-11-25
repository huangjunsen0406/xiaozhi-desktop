import type { HoverAnchor } from '@shared/types'
import type { BrowserWindow, Rectangle } from 'electron'
import type { HoverMode } from './position'
import { screen } from 'electron'
import { ensureMiniWindow, getLive2dWindow, getPetsWindow } from '../windows/windowManager'
import { buildHoverWindow } from './HoverWindow'
import { computeHoverPosition } from './position'
import { HoverRelay } from './relay'

let hoverWin: BrowserWindow | null = null
let currentAnchor: HoverAnchor = 'mini'
const relay = new HoverRelay()

function getAnchorWindow(anchor: HoverAnchor): BrowserWindow | null {
  if (anchor === 'mini')
    return ensureMiniWindow()
  if (anchor === 'live2d')
    return getLive2dWindow()
  return getPetsWindow()
}

export function ensureHoverWindow(): BrowserWindow {
  if (!hoverWin) {
    hoverWin = buildHoverWindow()
    hoverWin.on('closed', () => {
      relay.stop()
      hoverWin = null
      currentAnchor = 'mini'
    })
  }
  return hoverWin
}

function placeHover(anchorBounds: Rectangle): HoverMode {
  const hover = ensureHoverWindow()
  const work = screen.getDisplayMatching(anchorBounds).workArea
  const [w, h] = hover.getSize()
  const pos = computeHoverPosition(anchorBounds, { width: w, height: h }, work)
  hover.setPosition(Math.round(pos.x), Math.round(pos.y))
  try {
    hover.webContents.send('hover:orientation', { mode: pos.mode })
  }
  catch {}
  return pos.mode
}

export function showForAnchor(anchor: HoverAnchor = 'mini'): void {
  const target = getAnchorWindow(anchor)
  const effectiveAnchor: HoverAnchor = target && !target.isDestroyed() ? anchor : 'mini'
  const anchorWin = effectiveAnchor === anchor && target ? target : ensureMiniWindow()

  currentAnchor = effectiveAnchor
  const hover = ensureHoverWindow()
  placeHover(anchorWin.getBounds())
  hover.showInactive()
  hover.moveTop()
}

export function show(): void {
  showForAnchor('mini')
}

export function hide(): void {
  if (!hoverWin)
    return
  relay.stop()
  hoverWin.hide()
  currentAnchor = 'mini'
}

export function reposition(): void {
  const hover = ensureHoverWindow()
  if (!hover.isVisible())
    return

  const anchorWin = getAnchorWindow(currentAnchor)
  if (!anchorWin || anchorWin.isDestroyed()) {
    hide()
    return
  }
  placeHover(anchorWin.getBounds())
}

export function onMiniEnter(): void {
  relay.stop()
  showForAnchor('mini')
}

export function onMiniLeave(): void {
  const hover = ensureHoverWindow()
  if (!hover.isVisible() || currentAnchor !== 'mini')
    return
  relay.start(ensureMiniWindow().getBounds(), hover.getBounds(), hide)
}

export function onHoverEnter(): void {
  relay.stop()
}

export function onHoverLeave(): void {
  const hover = ensureHoverWindow()
  if (!hover.isVisible())
    return

  const anchorWin = getAnchorWindow(currentAnchor)
  if (!anchorWin || anchorWin.isDestroyed()) {
    hide()
    return
  }
  relay.start(anchorWin.getBounds(), hover.getBounds(), hide)
}
