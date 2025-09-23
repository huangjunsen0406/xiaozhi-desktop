import type { BrowserWindow } from 'electron'
import { screen } from 'electron'
import { buildHoverWindow } from './hoverWindow'
import { buildMainWindow } from './mainWindow'
import { buildMiniWindow } from './miniWindow'
import { buildPanelWindow } from './panelWindow'

let mainWindow: BrowserWindow | null = null
let miniWindow: BrowserWindow | null = null
let panelWindow: BrowserWindow | null = null
let hoverWindow: BrowserWindow | null = null

export function ensureMainWindow(): BrowserWindow {
  if (!mainWindow) {
    mainWindow = buildMainWindow()
    mainWindow.on('closed', () => {
      mainWindow = null
    })
  }
  return mainWindow
}

export function ensureMiniWindow(): BrowserWindow {
  if (!miniWindow) {
    miniWindow = buildMiniWindow()
    miniWindow.on('closed', () => {
      miniWindow = null
    })
  }
  return miniWindow
}

export function ensurePanelWindow(): BrowserWindow {
  if (!panelWindow) {
    panelWindow = buildPanelWindow()
    panelWindow.on('closed', () => {
      panelWindow = null
    })
  }
  return panelWindow
}
export function ensureHoverWindow(): BrowserWindow {
  if (!hoverWindow) {
    hoverWindow = buildHoverWindow()
    hoverWindow.on('closed', () => {
      hoverWindow = null
    })
  }
  return hoverWindow
}

export function showHoverBesideMini(offset = 8): void {
  const mini = ensureMiniWindow()
  const hover = ensureHoverWindow()
  const miniBounds = mini.getBounds()
  const display = screen.getDisplayMatching(miniBounds)
  const work = display.workArea
  const [hw, hh] = hover.getSize()
  const workLeft = work.x
  const workRight = work.x + work.width
  const workTop = work.y
  const workBottom = work.y + work.height
  const miniRight = miniBounds.x + miniBounds.width
  const miniBottom = miniBounds.y + miniBounds.height
  const miniCenterX = miniBounds.x + Math.floor(miniBounds.width / 2)
  const miniCenterY = miniBounds.y + Math.floor(miniBounds.height / 2)
  const spaceRight = workRight - miniRight
  const spaceLeft = miniBounds.x - workLeft
  const spaceBelow = workBottom - miniBottom
  const spaceAbove = miniBounds.y - workTop
  const needWidth = hw + offset
  const needHeight = hh + offset

  type Mode = 'right' | 'left' | 'down' | 'up'
  let mode: Mode
  if (spaceRight >= needWidth || (spaceRight >= spaceLeft && spaceRight > 0))
    mode = 'right'
  else if (spaceLeft >= needWidth)
    mode = 'left'
  else if (spaceBelow >= needHeight || (spaceBelow >= spaceAbove && spaceBelow > 0))
    mode = 'down'
  else
    mode = 'up'

  let x: number
  let y: number
  if (mode === 'right') {
    x = miniRight + offset
    y = Math.min(Math.max(miniCenterY - Math.floor(hh / 2), workTop), workBottom - hh)
  }
  else if (mode === 'left') {
    x = miniBounds.x - hw - offset
    y = Math.min(Math.max(miniCenterY - Math.floor(hh / 2), workTop), workBottom - hh)
  }
  else if (mode === 'down') {
    y = miniBottom + offset
    x = Math.min(Math.max(miniCenterX - Math.floor(hw / 2), workLeft), workRight - hw)
  }
  else { // up
    y = miniBounds.y - hh - offset
    x = Math.min(Math.max(miniCenterX - Math.floor(hw / 2), workLeft), workRight - hw)
  }

  hover.setPosition(x, y)
  // 若 hover 窗比 mini 高，可尽量顶部对齐
  hover.showInactive()
  hover.moveTop()
  try {
    hover.webContents.send('hover:orientation', { mode })
  }
  catch {}
}

export function hideHover(): void {
  hoverWindow?.hide()
}

export function repositionHoverBesideMini(offset = 8): void {
  if (!hoverWindow || !hoverWindow.isVisible())
    return
  const mini = ensureMiniWindow()
  const miniBounds = mini.getBounds()
  const display = screen.getDisplayMatching(miniBounds)
  const work = display.workArea
  const [hw, hh] = hoverWindow.getSize()
  const workLeft = work.x
  const workRight = work.x + work.width
  const workTop = work.y
  const workBottom = work.y + work.height
  const miniRight = miniBounds.x + miniBounds.width
  const miniBottom = miniBounds.y + miniBounds.height
  const miniCenterX = miniBounds.x + Math.floor(miniBounds.width / 2)
  const miniCenterY = miniBounds.y + Math.floor(miniBounds.height / 2)
  const spaceRight = workRight - miniRight
  const spaceLeft = miniBounds.x - workLeft
  const spaceBelow = workBottom - miniBottom
  const spaceAbove = miniBounds.y - workTop
  const needWidth = hw + offset
  const needHeight = hh + offset

  type Mode = 'right' | 'left' | 'down' | 'up'
  let mode: Mode
  if (spaceRight >= needWidth || (spaceRight >= spaceLeft && spaceRight > 0))
    mode = 'right'
  else if (spaceLeft >= needWidth)
    mode = 'left'
  else if (spaceBelow >= needHeight || (spaceBelow >= spaceAbove && spaceBelow > 0))
    mode = 'down'
  else
    mode = 'up'

  let x: number
  let y: number
  if (mode === 'right') {
    x = miniRight + offset
    y = Math.min(Math.max(miniCenterY - Math.floor(hh / 2), workTop), workBottom - hh)
  }
  else if (mode === 'left') {
    x = miniBounds.x - hw - offset
    y = Math.min(Math.max(miniCenterY - Math.floor(hh / 2), workTop), workBottom - hh)
  }
  else if (mode === 'down') {
    y = miniBottom + offset
    x = Math.min(Math.max(miniCenterX - Math.floor(hw / 2), workLeft), workRight - hw)
  }
  else { // up
    y = miniBounds.y - hh - offset
    x = Math.min(Math.max(miniCenterX - Math.floor(hw / 2), workLeft), workRight - hw)
  }

  hoverWindow.setPosition(x, y)
  try {
    hoverWindow.webContents.send('hover:orientation', { mode })
  }
  catch {}
}

export function toggleToMini(): void {
  const mini = ensureMiniWindow()
  const main = ensureMainWindow()
  mini.show()
  main.hide()
}

export function toggleToMain(): void {
  if (mainWindow)
    mainWindow.show()
  if (miniWindow)
    miniWindow.hide()
}

export function togglePanel(): void {
  const panel = ensurePanelWindow()
  if (panel.isVisible())
    panel.hide()
  else
    panel.show()
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}
