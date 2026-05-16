import type { BrowserWindow } from 'electron'
import process from 'node:process'
import { hide as hideHover } from '../hover/controller'
import { getLogger } from '../utils/logger'
import { buildActivationWindow, buildBackgroundAudioWindow, buildChatWindow, buildLive2dWindow, buildMainWindow, buildMiniWindow, buildPanelWindow, buildPetsWindow, buildSettingsWindow } from './builders'

const logger = getLogger('WindowManager')

// 窗口引用统一管理
const windowRefs = {
  main: { current: null as BrowserWindow | null },
  mini: { current: null as BrowserWindow | null },
  panel: { current: null as BrowserWindow | null },
  activation: { current: null as BrowserWindow | null },
  settings: { current: null as BrowserWindow | null },
  backgroundAudio: { current: null as BrowserWindow | null },
  chat: { current: null as BrowserWindow | null },
  live2d: { current: null as BrowserWindow | null },
  pets: { current: null as BrowserWindow | null },
}

// 显示模式状态管理
type DisplayMode = 'main' | 'mini' | 'chat' | 'live2d' | 'pets'
let currentDisplayMode: DisplayMode = 'main'
let onDisplayModeChanged: ((mode: DisplayMode) => void) | null = null

// 应用退出标志（用于区分关闭窗口和退出应用）
let isQuitting = false

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
    logger.info(`显示模式已切换: ${mode}`)

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

/**
 * 创建窗口确保函数的工厂
 * 统一处理窗口创建、引用管理和关闭事件
 */
function createWindowEnsurer(
  windowRef: { current: BrowserWindow | null },
  builder: () => BrowserWindow,
): () => BrowserWindow {
  return () => {
    if (windowRef.current == null) {
      const win = builder()
      windowRef.current = win
      win.on('closed', () => {
        windowRef.current = null
      })
    }
    return windowRef.current as BrowserWindow
  }
}

// 使用工厂函数创建所有窗口确保函数
export const ensureMainWindow = createWindowEnsurer(
  windowRefs.main,
  buildMainWindow,
)

export const ensureMiniWindow = createWindowEnsurer(
  windowRefs.mini,
  buildMiniWindow,
)

export const ensurePanelWindow = createWindowEnsurer(
  windowRefs.panel,
  buildPanelWindow,
)

export const ensureActivationWindow = createWindowEnsurer(
  windowRefs.activation,
  buildActivationWindow,
)

export const ensureSettingsWindow = createWindowEnsurer(
  windowRefs.settings,
  buildSettingsWindow,
)

export const ensureBackgroundAudioWindow = createWindowEnsurer(
  windowRefs.backgroundAudio,
  buildBackgroundAudioWindow,
)

export const ensureChatWindow = createWindowEnsurer(
  windowRefs.chat,
  buildChatWindow,
)

export const ensureLive2dWindow = createWindowEnsurer(
  windowRefs.live2d,
  buildLive2dWindow,
)

export const ensurePetsWindow = createWindowEnsurer(
  windowRefs.pets,
  buildPetsWindow,
)

// 窗口切换和控制函数
export function toggleToMini(): void {
  const mini = ensureMiniWindow()
  const main = ensureMainWindow()
  mini.show()
  main.hide()
  if (windowRefs.chat.current)
    windowRefs.chat.current.hide()
  if (windowRefs.live2d.current)
    windowRefs.live2d.current.hide()
  if (windowRefs.pets.current)
    windowRefs.pets.current.hide()
  setDisplayMode('mini')
}

export function toggleToMain(): void {
  if (windowRefs.main.current)
    windowRefs.main.current.show()
  if (windowRefs.mini.current)
    windowRefs.mini.current.hide()
  if (windowRefs.chat.current)
    windowRefs.chat.current.hide()
  if (windowRefs.live2d.current)
    windowRefs.live2d.current.hide()
  if (windowRefs.pets.current)
    windowRefs.pets.current.hide()
  // 关闭 panel 窗口（仅在 miniview 模式下可用）
  if (windowRefs.panel.current)
    windowRefs.panel.current.hide()
  // 隐藏悬浮窗
  hideHover()
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
  return windowRefs.main.current
}

export function toggleSettings(): void {
  const win = ensureSettingsWindow()
  if (win.isVisible())
    win.hide()
  else
    win.show()
}

export function getBackgroundAudioWindow(): BrowserWindow | null {
  return windowRefs.backgroundAudio.current
}

export function toggleToChat(): void {
  const chat = ensureChatWindow()
  chat.show()
  if (windowRefs.main.current)
    windowRefs.main.current.hide()
  if (windowRefs.mini.current)
    windowRefs.mini.current.hide()
  if (windowRefs.live2d.current)
    windowRefs.live2d.current.hide()
  if (windowRefs.pets.current)
    windowRefs.pets.current.hide()
  // 关闭 panel 窗口（仅在 miniview 模式下可用）
  if (windowRefs.panel.current)
    windowRefs.panel.current.hide()
  // 隐藏悬浮窗
  hideHover()
  setDisplayMode('chat')
}

export function getChatWindow(): BrowserWindow | null {
  return windowRefs.chat.current
}

export function toggleToLive2d(): void {
  const win = ensureLive2dWindow()
  win.show()
  win.moveTop()
  if (windowRefs.main.current)
    windowRefs.main.current.hide()
  if (windowRefs.mini.current)
    windowRefs.mini.current.hide()
  if (windowRefs.chat.current)
    windowRefs.chat.current.hide()
  if (windowRefs.pets.current)
    windowRefs.pets.current.hide()
  // 关闭 panel 窗口（仅在 miniview 模式下可用）
  if (windowRefs.panel.current)
    windowRefs.panel.current.hide()
  // 隐藏悬浮窗
  hideHover()
  setDisplayMode('live2d')
}

export function getLive2dWindow(): BrowserWindow | null {
  return windowRefs.live2d.current
}

export function toggleToPets(): void {
  const win = ensurePetsWindow()
  win.show()
  win.moveTop()
  if (windowRefs.main.current)
    windowRefs.main.current.hide()
  if (windowRefs.mini.current)
    windowRefs.mini.current.hide()
  if (windowRefs.chat.current)
    windowRefs.chat.current.hide()
  if (windowRefs.live2d.current)
    windowRefs.live2d.current.hide()
  // 关闭 panel 窗口（仅在 miniview 模式下可用）
  if (windowRefs.panel.current)
    windowRefs.panel.current.hide()
  // 隐藏悬浮窗
  hideHover()
  setDisplayMode('pets')
}

export function getPetsWindow(): BrowserWindow | null {
  return windowRefs.pets.current
}

/**
 * 获取当前显示模式对应的窗口
 */
export function getCurrentModeWindow(): BrowserWindow | null {
  switch (currentDisplayMode) {
    case 'main':
      return windowRefs.main.current
    case 'mini':
      return windowRefs.mini.current
    case 'chat':
      return windowRefs.chat.current
    case 'live2d':
      return windowRefs.live2d.current
    case 'pets':
      return windowRefs.pets.current
    default:
      return windowRefs.main.current
  }
}

/**
 * 设置应用退出标志
 */
export function setIsQuitting(value: boolean): void {
  isQuitting = value
}

/**
 * 获取应用退出标志
 */
export function getIsQuitting(): boolean {
  return isQuitting
}

/**
 * 窗口关闭事件处理器
 * macOS: 点击关闭按钮时隐藏窗口而不是销毁（除非正在退出应用）
 */
export function handleWindowClose(event: Electron.Event, win: BrowserWindow): void {
  if (process.platform === 'darwin' && !isQuitting) {
    event.preventDefault()
    win.hide()
  }
}
