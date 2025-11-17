import type { BrowserWindow } from 'electron'
import { buildActivationWindow, buildBackgroundAudioWindow, buildMainWindow, buildMiniWindow, buildPanelWindow, buildSettingsWindow } from './builders'

let mainWindow: BrowserWindow | null = null
let miniWindow: BrowserWindow | null = null
let panelWindow: BrowserWindow | null = null
let activationWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let backgroundAudioWindow: BrowserWindow | null = null

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

export function ensureSettingsWindow(): BrowserWindow {
  if (settingsWindow == null) {
    const win = buildSettingsWindow()
    settingsWindow = win
    win.on('closed', () => {
      settingsWindow = null
    })
  }
  return settingsWindow as BrowserWindow
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

export function toggleSettings(): void {
  const win = ensureSettingsWindow()
  if (win.isVisible())
    win.hide()
  else
    win.show()
}

export function ensureBackgroundAudioWindow(): BrowserWindow {
  if (backgroundAudioWindow == null) {
    const win = buildBackgroundAudioWindow()
    backgroundAudioWindow = win
    win.on('closed', () => {
      backgroundAudioWindow = null
    })
  }
  return backgroundAudioWindow as BrowserWindow
}

export function getBackgroundAudioWindow(): BrowserWindow | null {
  return backgroundAudioWindow
}
