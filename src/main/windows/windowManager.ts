import type { BrowserWindow } from 'electron'
import { buildActivationWindow, buildBackgroundAudioWindow, buildChatWindow, buildLive2dWindow, buildMainWindow, buildMiniWindow, buildPanelWindow, buildSettingsWindow } from './builders'

let mainWindow: BrowserWindow | null = null
let miniWindow: BrowserWindow | null = null
let panelWindow: BrowserWindow | null = null
let activationWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let backgroundAudioWindow: BrowserWindow | null = null
let chatWindow: BrowserWindow | null = null
let live2dWindow: BrowserWindow | null = null

// 显示模式状态管理
type DisplayMode = 'main' | 'mini' | 'chat' | 'live2d'
let currentDisplayMode: DisplayMode = 'main'
let onDisplayModeChanged: ((mode: DisplayMode) => void) | null = null

/**
 * 获取当前显示模式
 */
export function getCurrentDisplayMode(): DisplayMode {
  return currentDisplayMode
}

/**
 * 设置显示模式（内部使用，更新状态并触发回调）
 */
function setDisplayMode(mode: DisplayMode): void {
  if (currentDisplayMode !== mode) {
    currentDisplayMode = mode
    console.log(`[WindowManager] 显示模式已切换: ${mode}`)

    // 触发回调更新菜单
    if (onDisplayModeChanged) {
      onDisplayModeChanged(mode)
    }
  }
}

/**
 * 注册显示模式变化回调（用于更新托盘和 Dock 菜单）
 */
export function onDisplayModeChange(callback: (mode: DisplayMode) => void): void {
  onDisplayModeChanged = callback
}

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
  if (chatWindow)
    chatWindow.hide()
  if (live2dWindow)
    live2dWindow.hide()
  setDisplayMode('mini')
}

export function toggleToMain(): void {
  if (mainWindow)
    mainWindow.show()
  if (miniWindow)
    miniWindow.hide()
  if (chatWindow)
    chatWindow.hide()
  if (live2dWindow)
    live2dWindow.hide()
  setDisplayMode('main')
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

export function ensureChatWindow(): BrowserWindow {
  if (chatWindow == null) {
    const win = buildChatWindow()
    chatWindow = win
    win.on('closed', () => {
      chatWindow = null
    })
  }
  return chatWindow as BrowserWindow
}

export function toggleToChat(): void {
  const chat = ensureChatWindow()
  chat.show()
  if (mainWindow)
    mainWindow.hide()
  if (miniWindow)
    miniWindow.hide()
  if (live2dWindow)
    live2dWindow.hide()
  setDisplayMode('chat')
}

export function getChatWindow(): BrowserWindow | null {
  return chatWindow
}

export function ensureLive2dWindow(): BrowserWindow {
  if (live2dWindow == null) {
    const win = buildLive2dWindow()
    live2dWindow = win
    win.on('closed', () => {
      live2dWindow = null
    })
  }
  return live2dWindow as BrowserWindow
}

export function toggleToLive2d(): void {
  const win = ensureLive2dWindow()
  win.show()
  win.moveTop()
  if (mainWindow)
    mainWindow.hide()
  if (miniWindow)
    miniWindow.hide()
  if (chatWindow)
    chatWindow.hide()
  setDisplayMode('live2d')
}

export function getLive2dWindow(): BrowserWindow | null {
  return live2dWindow
}
