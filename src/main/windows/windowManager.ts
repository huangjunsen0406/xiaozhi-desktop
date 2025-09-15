import type { BrowserWindow } from 'electron'
import { buildMainWindow } from './mainWindow'
import { buildMiniWindow } from './miniWindow'
import { buildPanelWindow } from './panelWindow'

let mainWindow: BrowserWindow | null = null
let miniWindow: BrowserWindow | null = null
let panelWindow: BrowserWindow | null = null

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
