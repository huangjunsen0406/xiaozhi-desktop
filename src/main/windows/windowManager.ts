import type { BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { app, ipcMain, screen } from 'electron'
import { hide as hideHover } from '../hover/controller'
import { DatabaseManager } from '../services/database'
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
 * 位置记忆配置：
 * - corner: 存窗口左上角 (x, y)，适用于尺寸固定且不与其它窗口共享位置的模式（main / chat）
 * - center-shared: 存窗口视觉中心 (cx, cy)，切换时按各自尺寸反推左上角；
 *   适用于多个尺寸不同的窗口共享同一个视觉位置（live2d + pets 共用 'pet-shared'）
 */
type PositionConfig
  = | { type: 'corner', key: string }
    | { type: 'center-shared', key: string }

/**
 * 创建窗口确保函数的工厂
 * 统一处理窗口创建、引用管理和关闭事件。
 * 传入 position 时启用位置记忆。
 */
function createWindowEnsurer(
  windowRef: { current: BrowserWindow | null },
  builder: () => BrowserWindow,
  position?: PositionConfig,
): () => BrowserWindow {
  return () => {
    if (windowRef.current == null) {
      const win = builder()
      windowRef.current = win
      win.on('closed', () => {
        windowRef.current = null
      })
      if (position) {
        if (position.type === 'corner') {
          setupPositionMemory(win, position.key)
        }
        else {
          setupSharedCenterPosition(win, position.key)
        }
      }
    }
    return windowRef.current as BrowserWindow
  }
}

/**
 * 为窗口装配位置记忆：
 * - 创建后立刻从 DB 读取上次位置并 setPosition（window 仍 show: false，无闪烁）
 * - 无记录时用当前可见的主要窗口中心做种子，避免首次切换跑到默认右下角
 * - 监听 move 事件 debounce 300ms 写回 DB
 */
function setupPositionMemory(win: BrowserWindow, key: string): void {
  const db = DatabaseManager.getInstance()
  try {
    const saved = db.getWindowPosition(key)
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
      win.setPosition(saved.x, saved.y)
    }
    else {
      const seed = computeSeedPosition(win)
      if (seed) {
        win.setPosition(seed.x, seed.y)
        // 种子也持久化：避免反复进入该模式时位置漂移
        db.setWindowPosition(key, seed.x, seed.y)
      }
    }
  }
  catch (error) {
    logger.warn(`读取窗口位置失败 (${key})`, error)
  }

  let timer: NodeJS.Timeout | null = null
  const flush = (): void => {
    timer = null
    if (win.isDestroyed())
      return
    const [x, y] = win.getPosition()
    try {
      DatabaseManager.getInstance().setWindowPosition(key, x, y)
    }
    catch (error) {
      logger.warn(`保存窗口位置失败 (${key})`, error)
    }
  }

  win.on('move', () => {
    if (win.isDestroyed())
      return
    if (timer)
      clearTimeout(timer)
    timer = setTimeout(flush, 300)
  })

  win.once('closed', () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  })
}

/**
 * 从 DB 读取共享中心位置并应用到窗口（按窗口当前尺寸反推左上角）
 * 用于切换时把窗口对齐到最新的共享位置；无记录时返回 false 由调用方走兜底
 */
function applySharedCenterPosition(win: BrowserWindow, key: string): boolean {
  if (win.isDestroyed())
    return false
  try {
    const saved = DatabaseManager.getInstance().getWindowPosition(key)
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
      const [w, h] = win.getSize()
      win.setPosition(Math.round(saved.x - w / 2), Math.round(saved.y - h / 2))
      return true
    }
  }
  catch (error) {
    logger.warn(`应用共享位置失败 (${key})`, error)
  }
  return false
}

/**
 * 为窗口装配"共享视觉中心"位置记忆：
 * - DB 中 (x, y) 解释为视觉中心 (cx, cy)，而非左上角
 * - 读：按当前窗口尺寸 (w, h) 反推左上角 setPosition(cx - w/2, cy - h/2)
 * - 写：取当前左上角 + 尺寸算中心点写回 DB
 * - 使用场景：尺寸不同但需要共享同一视觉位置的窗口（live2d + pets）
 */
function setupSharedCenterPosition(win: BrowserWindow, key: string): void {
  if (!applySharedCenterPosition(win, key)) {
    // 无记录：用种子位置兜底，并把它换算为中心点写入 DB
    const seed = computeSeedPosition(win)
    if (seed) {
      win.setPosition(seed.x, seed.y)
      const [w, h] = win.getSize()
      const cx = Math.round(seed.x + w / 2)
      const cy = Math.round(seed.y + h / 2)
      try {
        DatabaseManager.getInstance().setWindowPosition(key, cx, cy)
      }
      catch (error) {
        logger.warn(`保存共享窗口位置种子失败 (${key})`, error)
      }
    }
  }

  let timer: NodeJS.Timeout | null = null
  const flush = (): void => {
    timer = null
    if (win.isDestroyed())
      return
    const [x, y] = win.getPosition()
    const [w, h] = win.getSize()
    const cx = Math.round(x + w / 2)
    const cy = Math.round(y + h / 2)
    try {
      DatabaseManager.getInstance().setWindowPosition(key, cx, cy)
    }
    catch (error) {
      logger.warn(`保存共享窗口位置失败 (${key})`, error)
    }
  }

  win.on('move', () => {
    if (win.isDestroyed())
      return
    if (timer)
      clearTimeout(timer)
    timer = setTimeout(flush, 300)
  })

  win.once('closed', () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  })
}

/**
 * 计算位置种子：用当前显示模式（或其它可见的主要窗口）的中心点对齐新窗口
 * 用中心点而不是左上角，避免不同尺寸窗口对齐到默认右下角导致跑到屏外
 */
function computeSeedPosition(newWin: BrowserWindow): { x: number, y: number } | null {
  const [nw, nh] = newWin.getSize()

  // 候选窗口：当前模式优先，其它主要窗口兜底
  const seen = new Set<BrowserWindow>()
  const candidates: BrowserWindow[] = []
  const push = (ref: { current: BrowserWindow | null }): void => {
    const w = ref.current
    if (w && !w.isDestroyed() && w !== newWin && !seen.has(w)) {
      seen.add(w)
      candidates.push(w)
    }
  }
  switch (currentDisplayMode) {
    case 'pets':
      push(windowRefs.pets)
      break
    case 'live2d':
      push(windowRefs.live2d)
      break
    case 'main':
      push(windowRefs.main)
      break
    case 'chat':
      push(windowRefs.chat)
      break
    case 'mini':
      push(windowRefs.mini)
      break
  }
  push(windowRefs.pets)
  push(windowRefs.live2d)
  push(windowRefs.main)
  push(windowRefs.chat)

  const ref = candidates[0]
  if (!ref)
    return null
  const [x, y] = ref.getPosition()
  const [w, h] = ref.getSize()
  const cx = x + w / 2
  const cy = y + h / 2
  return {
    x: Math.round(cx - nw / 2),
    y: Math.round(cy - nh / 2),
  }
}

// 使用工厂函数创建所有窗口确保函数
export const ensureMainWindow = createWindowEnsurer(
  windowRefs.main,
  buildMainWindow,
  { type: 'corner', key: 'main' },
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
  { type: 'corner', key: 'chat' },
)

export const ensureLive2dWindow = createWindowEnsurer(
  windowRefs.live2d,
  buildLive2dWindow,
  { type: 'center-shared', key: 'pet-shared' },
)

export const ensurePetsWindow = createWindowEnsurer(
  windowRefs.pets,
  buildPetsWindow,
  { type: 'center-shared', key: 'pet-shared' },
)

export const ensureBubbleWindow = createWindowEnsurer(
  windowRefs.bubble,
  buildBubbleWindow,
)

// Live2D 模型头顶相对于其窗口顶边的偏移（CSS px）。
// Live2D 窗口尺寸固定，模型底部对齐，矮模型头顶距窗口顶可能很远；
// 由渲染端 setupModel 通过 IPC bubble:set-anchor-offset 上报。
let live2dAnchorOffsetY = 0

// 气泡贴边时与屏幕工作区边缘的留白
const BUBBLE_EDGE_MARGIN = 5
// 箭头中心相对气泡左/右边的最小距离（圆角 10 + 箭头底半宽 6）
const BUBBLE_ARROW_HALF = 16

function getAnchorOffsetForTarget(target: BrowserWindow): number {
  if (target === windowRefs.live2d.current)
    return live2dAnchorOffsetY
  return 0
}

/**
 * 将气泡窗口定位到目标窗口正上方（按锚点偏移指向模型头顶）
 * 屏幕边缘时 clamp 气泡到工作区内，箭头滑动指向模型中心
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
  const anchorOffset = getAnchorOffsetForTarget(targetWindow)

  const targetCenterX = x + w / 2
  const desiredBubbleX = targetCenterX - bw / 2

  // 拿目标窗口所在屏幕的工作区，避免多屏场景下气泡跑到主屏
  const targetBounds = targetWindow.getBounds()
  const display = screen.getDisplayMatching(targetBounds)
  const workArea = display.workArea
  const minX = workArea.x + BUBBLE_EDGE_MARGIN
  const maxX = workArea.x + workArea.width - bw - BUBBLE_EDGE_MARGIN

  const bubbleX = Math.round(Math.min(Math.max(desiredBubbleX, minX), maxX))
  const bubbleY = Math.round(y + anchorOffset - bh - 4)

  bubble.setPosition(bubbleX, bubbleY)

  // 箭头水平位置（相对气泡窗口左上角），在圆角内 clamp
  const arrowMin = BUBBLE_ARROW_HALF
  const arrowMax = Math.max(arrowMin, bw - BUBBLE_ARROW_HALF)
  const arrowX = Math.round(Math.min(Math.max(targetCenterX - bubbleX, arrowMin), arrowMax))
  bubble.webContents.send('bubble:set-arrow-x', arrowX)
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

// 当前气泡跟随的目标窗口与监听句柄（确保切换时只挂一个 move 监听）
let currentBubbleTarget: BrowserWindow | null = null
let currentBubbleMoveHandler: (() => void) | null = null
let currentBubbleClosedHandler: (() => void) | null = null

/**
 * 清除气泡对目标窗口的跟随监听
 */
function clearBubbleFollow(): void {
  if (currentBubbleTarget && !currentBubbleTarget.isDestroyed()) {
    if (currentBubbleMoveHandler)
      currentBubbleTarget.removeListener('move', currentBubbleMoveHandler)
    if (currentBubbleClosedHandler)
      currentBubbleTarget.removeListener('closed', currentBubbleClosedHandler)
  }
  currentBubbleTarget = null
  currentBubbleMoveHandler = null
  currentBubbleClosedHandler = null
}

/**
 * 设置气泡跟随目标窗口移动；切换目标时清理旧监听并立即重定位
 */
function setupBubbleFollow(targetWindow: BrowserWindow): void {
  // 同一目标重复调用直接返回（仍然立即重定位一次）
  if (currentBubbleTarget === targetWindow) {
    if (windowRefs.bubble.current?.isVisible())
      positionBubbleAbove(targetWindow)
    return
  }

  // 清理旧目标的监听
  clearBubbleFollow()

  currentBubbleTarget = targetWindow

  currentBubbleMoveHandler = (): void => {
    const bubble = windowRefs.bubble.current
    if (!bubble || bubble.isDestroyed() || !bubble.isVisible())
      return
    if (targetWindow.isDestroyed())
      return
    positionBubbleAbove(targetWindow)
  }

  currentBubbleClosedHandler = (): void => {
    clearBubbleFollow()
    hideBubbleWindow()
  }

  targetWindow.on('move', currentBubbleMoveHandler)
  targetWindow.once('closed', currentBubbleClosedHandler)

  // 切到新目标后立即重定位（若当前气泡可见）
  const bubble = windowRefs.bubble.current
  if (bubble && !bubble.isDestroyed() && bubble.isVisible())
    positionBubbleAbove(targetWindow)
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

// 渲染端上报模型头顶相对窗口顶边的偏移（仅 Live2D 使用）
ipcMain.on('bubble:set-anchor-offset', (_event, offsetY: number) => {
  if (typeof offsetY !== 'number' || !Number.isFinite(offsetY))
    return
  live2dAnchorOffsetY = Math.max(0, offsetY)
  // 当前正跟随 Live2D 且气泡可见时，立即重定位
  if (currentBubbleTarget && currentBubbleTarget === windowRefs.live2d.current) {
    const bubble = windowRefs.bubble.current
    if (bubble && !bubble.isDestroyed() && bubble.isVisible())
      positionBubbleAbove(currentBubbleTarget)
  }
})

// 窗口切换和控制函数
export function toggleToMini(): void {
  const mini = ensureMiniWindow()
  mini.show()
  // 仅在 main 已存在时 hide，不要为了 hide 而主动创建（否则 ready-to-show 路径已删除后，
  // 这里也会拖累 main 的延迟创建语义）
  windowRefs.main.current?.hide()
  if (windowRefs.chat.current)
    windowRefs.chat.current.hide()
  if (windowRefs.live2d.current)
    windowRefs.live2d.current.hide()
  if (windowRefs.pets.current)
    windowRefs.pets.current.hide()
  hideBubbleWindow()
  clearBubbleFollow()
  setDisplayMode('mini')
}

export function toggleToMain(): void {
  // builder 不再自动 show，必须显式 ensure + show
  const main = ensureMainWindow()
  main.show()
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
  clearBubbleFollow()
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

export function hideActivation(): void {
  const win = windowRefs.activation.current
  if (win && !win.isDestroyed()) {
    win.hide()
  }
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
  clearBubbleFollow()
  setDisplayMode('chat')
}

export function getChatWindow(): BrowserWindow | null {
  return windowRefs.chat.current
}

export function toggleToLive2d(): void {
  const win = ensureLive2dWindow()
  // 每次切到 live2d 都重新从 DB 应用共享位置：
  // 避免“窗口已存在”的路径下错过 pets 拖动后的最新位置
  applySharedCenterPosition(win, 'pet-shared')
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
  // 每次切到 pets 都重新从 DB 应用共享位置：
  // 避免“窗口已存在”的路径下错过 live2d 拖动后的最新位置
  applySharedCenterPosition(win, 'pet-shared')
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
