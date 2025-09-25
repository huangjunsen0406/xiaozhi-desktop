import type { BrowserWindow } from 'electron'
import { buildActivationWindow, buildMainWindow, buildMiniWindow, buildPanelWindow } from './builders'

let mainWindow: BrowserWindow | null = null
let miniWindow: BrowserWindow | null = null
let panelWindow: BrowserWindow | null = null
let activationWindow: BrowserWindow | null = null

export function ensureMainWindow(): BrowserWindow {
  if (mainWindow == null) {
    const win = buildMainWindow()
    mainWindow = win
    win.on('closed', () => {
      mainWindow = null
    })
  }
  return mainWindow as BrowserWindow
}

export function ensureMiniWindow(): BrowserWindow {
  if (miniWindow == null) {
    const win = buildMiniWindow()
    miniWindow = win
    win.on('closed', () => {
      miniWindow = null
    })
  }
  return miniWindow as BrowserWindow
}

export function ensurePanelWindow(): BrowserWindow {
  if (panelWindow == null) {
    const win = buildPanelWindow()
    panelWindow = win
    win.on('closed', () => {
      panelWindow = null
    })
  }
  return panelWindow as BrowserWindow
}

export function ensureActivationWindow(): BrowserWindow {
  if (activationWindow == null) {
    const win = buildActivationWindow()
    activationWindow = win
    win.on('closed', () => {
      activationWindow = null
    })
  }
  return activationWindow as BrowserWindow
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

export function showActivation(): void {
  const win = ensureActivationWindow()
  win.center()
  win.show()
  win.moveTop()
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}
