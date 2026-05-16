import type { BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { app, ipcMain } from 'electron'
import { hide as hideHover } from '../hover/controller'
import { getLogger } from '../utils/logger'
import { buildActivationWindow, buildBackgroundAudioWindow, buildBubbleWindow, buildChatWindow, buildLive2dWindow, buildMainWindow, buildMiniWindow, buildPanelWindow, buildPetsWindow, buildSettingsWindow } from './builders'

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
  bubble: { current: null as BrowserWindow | null },
}

// 显示模式状态管理
type DisplayMode = 'main' | 'mini' | 'chat' | 'live2d' | 'pets'

// 显示模式持久化文件路径
const DISPLAY_MODE_FILE = path.join(app.getPath('userData'), 'display-mode.json')

/**
 * 保存显示模式到磁盘
 */
function saveDisplayMode(mode: DisplayMode): void {
  try {
    fs.writeFileSync(DISPLAY_MODE_FILE, JSON.stringify({ mode }), 'utf-8')
  }
  catch (error) {
    logger.warn('保存显示模式失败', error)
  }
}

/**
 * 从磁盘加载显示模式
 */
function loadDisplayMode(): DisplayMode {
  try {
    const data = JSON.parse(fs.readFileSync(DISPLAY_MODE_FILE, 'utf-8'))
    const mode = data?.mode
    // 校验是否为合法值
    if (mode === 'main' || mode === 'mini' || mode === 'chat' || mode === 'live2d' || mode === 'pets') {
      return mode
    }
    return 'main'
  }
  catch {
    return 'main'
  }
}

let currentDisplayMode: DisplayMode = loadDisplayMode()
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
 * 设置显示模式（内部使用，更新状态并触发回调，同时持久化到磁盘）
 */
function setDisplayMode(mode: DisplayMode): void {
  if (currentDisplayMode !== mode) {
    currentDisplayMode = mode
    saveDisplayMode(mode)
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

export const ensureBubbleWindow = createWindowEnsurer(
  windowRefs.bubble,
  buildBubbleWindow,
)

/**
 * 将气泡窗口定位到目标窗口正上方
 */
function positionBubbleAbove(targetWindow: BrowserWindow): void {
  const bubble = windowRefs.bubble.current
  if (!bubble || bubble.isDestroyed())
    return
  if (targetWindow.isDestroyed())
    return

  const [x, y] = targetWindow.getPosition()
  const [w] = targetWindow.getSize()
  const [bw, bh] = bubble.getSize()

  bubble.setPosition(
    Math.round(x + w / 2 - bw / 2),
    Math.round(y - bh - 4),
  )
}

/**
 * 显示气泡窗口（定位在目标窗口上方）
 */
function showBubbleAbove(targetWindow: BrowserWindow): void {
  const bubble = ensureBubbleWindow()
  positionBubbleAbove(targetWindow)
  bubble.showInactive()
  bubble.moveTop()
}

/**
 * 隐藏气泡窗口
 */
function hideBubbleWindow(): void {
  const bubble = windowRefs.bubble.current
  if (bubble && !bubble.isDestroyed()) {
    bubble.hide()
  }
}

/**
 * 获取当前活跃的精灵/Live2D 窗口
 */
function getCurrentPetWindow(): BrowserWindow | null {
  if (currentDisplayMode === 'pets' && windowRefs.pets.current) {
    return windowRefs.pets.current
  }
  if (currentDisplayMode === 'live2d' && windowRefs.live2d.current) {
    return windowRefs.live2d.current
  }
  return null
}

/**
 * 设置气泡跟随目标窗口移动
 */
function setupBubbleFollow(targetWindow: BrowserWindow): void {
  const updatePosition = (): void => {
    const bubble = windowRefs.bubble.current
    if (!bubble || bubble.isDestroyed() || !bubble.isVisible())
      return
    if (targetWindow.isDestroyed())
      return
    positionBubbleAbove(targetWindow)
  }

  targetWindow.on('move', updatePosition)

  // 目标窗口关闭时清理监听
  targetWindow.once('closed', () => {
    hideBubbleWindow()
  })
}

// 注册气泡窗口 IPC 通道
ipcMain.on('bubble:show', () => {
  const target = getCurrentPetWindow()
  if (target) {
    showBubbleAbove(target)
  }
})

ipcMain.on('bubble:hide', () => {
  hideBubbleWindow()
})

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
  hideBubbleWindow()
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
  hideBubbleWindow()
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
  hideBubbleWindow()
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
  // 确保气泡窗口就绪并设置跟随
  ensureBubbleWindow()
  setupBubbleFollow(win)
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
  // 确保气泡窗口就绪并设置跟随
  ensureBubbleWindow()
  setupBubbleFollow(win)
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
