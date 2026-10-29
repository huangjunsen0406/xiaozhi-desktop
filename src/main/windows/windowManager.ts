import type { DisplayMode, PetSurfaceContentSize, PetSurfaceId } from '@shared/types'
import fs from 'node:fs'
import process from 'node:process'
import { isDisplayMode } from '@shared/types'
import { BrowserWindow, ipcMain, screen } from 'electron'
import { hide as hideHover } from '../hover/controller'
import { getDatabase } from '../services/database'
import { getLogger } from '../utils/logger'
import { getDisplayModeFile } from '../utils/paths'
import { isWindowDragging } from './behaviors/DragBehavior'
import { buildActivationWindow, buildBackgroundAudioWindow, buildBubbleWindow, buildChatWindow, buildLive2dWindow, buildMainWindow, buildMiniWindow, buildPanelWindow, buildPetsWindow, buildSettingsWindow } from './builders'
import { reassertPetSurfaceTop } from './petSurfaceLayering'

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

export type { DisplayMode } from '@shared/types'

function getDisplayModeFilePath(): string {
  return getDisplayModeFile()
}

/**
 * 保存显示模式到磁盘
 */
function saveDisplayMode(mode: DisplayMode): void {
  try {
    fs.writeFileSync(getDisplayModeFilePath(), JSON.stringify({ mode }), 'utf-8')
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
    const data = JSON.parse(fs.readFileSync(getDisplayModeFilePath(), 'utf-8'))
    const mode = data?.mode
    return isDisplayMode(mode) ? mode : 'main'
  }
  catch {
    return 'main'
  }
}

let currentDisplayMode: DisplayMode = loadDisplayMode()
const displayModeListeners = new Set<(mode: DisplayMode, prev: DisplayMode) => void>()

// 应用退出标志（用于区分关闭窗口和退出应用）
let isQuitting = false

/**
 * 获取当前显示模式
 */
export function getCurrentDisplayMode(): DisplayMode {
  return currentDisplayMode
}

/**
 * 广播显示模式变更给所有渲染进程（设置页等需实时同步）
 */
function broadcastDisplayModeChanged(mode: DisplayMode): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('window:display-mode-changed', mode)
    }
  }
}

/**
 * 设置显示模式（内部使用，更新状态并触发回调，同时持久化到磁盘）
 */
function setDisplayMode(mode: DisplayMode): void {
  if (currentDisplayMode !== mode) {
    const prev = currentDisplayMode
    currentDisplayMode = mode
    saveDisplayMode(mode)
    logger.info(`显示模式已切换: ${mode}`)

    for (const listener of displayModeListeners) {
      try {
        listener(mode, prev)
      }
      catch (error) {
        logger.warn('显示模式变更监听失败', error)
      }
    }

    // 通知设置页等 renderer 同步 select
    broadcastDisplayModeChanged(mode)
  }
}

/**
 * 注册显示模式变化回调（托盘 / Dock / 埋点等可多次订阅）
 * @returns 取消订阅函数
 */
export function onDisplayModeChange(
  callback: (mode: DisplayMode, prev: DisplayMode) => void,
): () => void {
  displayModeListeners.add(callback)
  return () => {
    displayModeListeners.delete(callback)
  }
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
    if (windowRef.current == null || windowRef.current.isDestroyed()) {
      const win = builder()
      windowRef.current = win
      win.on('closed', () => {
        if (windowRef.current === win)
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
  const db = getDatabase()
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
      getDatabase().setWindowPosition(key, x, y)
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
 * 用于切换时把窗口对齐到最新的共享位置；无记录时返回 false 由调用方走兜底。
 * 应用后夹进 workArea，避免 pets 贴底切换到高 Live2D 时沉入 Dock。
 */
function applySharedCenterPosition(win: BrowserWindow, key: string): boolean {
  if (win.isDestroyed())
    return false
  try {
    const saved = getDatabase().getWindowPosition(key)
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
      const [w, h] = win.getSize()
      win.setPosition(Math.round(saved.x - w / 2), Math.round(saved.y - h / 2))
      // pet-shared：夹 workArea 后写回实际中心，避免下次再读到屏外中心
      if (key === 'pet-shared')
        clampPetWindowToWorkAreaAndPersist(win)
      else
        clampWindowToWorkArea(win)
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
      // 种子也可能在 Dock 下（从其它模式中心推算）；先夹 workArea
      if (key === 'pet-shared')
        clampPetWindowToWorkAreaAndPersist(win)
      else
        clampWindowToWorkArea(win)
      const [x, y] = win.getPosition()
      const [w, h] = win.getSize()
      const cx = Math.round(x + w / 2)
      const cy = Math.round(y + h / 2)
      try {
        getDatabase().setWindowPosition(key, cx, cy)
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
      getDatabase().setWindowPosition(key, cx, cy)
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

// 角色头顶相对于其窗口顶边的偏移（CSS px）。
// Live2D / Pets 由渲染端 measure 后经 pet-shell / bubble IPC 上报；用于气泡 anchor。
let live2dAnchorOffsetY = 0
let petsAnchorOffsetY = 0

// 当前气泡跟随的目标窗口与监听句柄（确保切换时只挂一个 move 监听）
// 提前声明：setPetSurfaceContentSize 在定义处之前就会引用。
let currentBubbleTarget: BrowserWindow | null = null
let currentBubbleMoveHandler: (() => void) | null = null
let currentBubbleClosedHandler: (() => void) | null = null

// 气泡贴边时与屏幕工作区边缘的留白
const BUBBLE_EDGE_MARGIN = 5
// 箭头中心相对气泡左/右边的最小距离（圆角 10 + 箭头底半宽 6）
const BUBBLE_ARROW_HALF = 16

/** 桌宠壳：内容级 bounds 的安全夹取与内边距（CSS px） */
const PET_SURFACE_PAD: Record<PetSurfaceId, number> = {
  pets: 8,
  // Live2D：小 pad 即可；过大 min/pad 会在矮模型头顶上方留空，气泡脱节
  live2d: 4,
  // 气泡：pad 必须为 0。渲染进程 measure 已含 CSS padding + BUBBLE_HEIGHT_SAFETY_PX；
  // 主进程再加 pad 会把客户区撑宽，.bubble width:100% 居中后左右出现透明空隙。
  bubble: 0,
}
const PET_SURFACE_MIN: Record<PetSurfaceId, { width: number, height: number }> = {
  pets: { width: 96, height: 104 },
  // 最小高度只保证可点，不强迫矮模型窗变高产生头顶空白
  live2d: { width: 80, height: 80 },
  // 仅作零宽/异常回退；短文案由固有宽度驱动，勿抬高 min 造成左右空白
  bubble: { width: 48, height: 28 },
}
const PET_SURFACE_MAX: Record<PetSurfaceId, { width: number, height: number }> = {
  // displayWidth max 224 → 精灵 h≈243 + pad；留余量
  pets: { width: 400, height: 480 },
  // displayWidth 224 → Live2D 视口 400×800；max 需覆盖 + pad（480×720 不够高）
  live2d: { width: 480, height: 820 },
  // 文案 cap 320 + 渲染端 BUBBLE_WIDTH_SAFETY_PX(10)；与 pets/live2d 窗宽完全解耦
  bubble: { width: 330, height: 200 },
}

function getAnchorOffsetForTarget(target: BrowserWindow): number {
  if (target === windowRefs.live2d.current)
    return live2dAnchorOffsetY
  if (target === windowRefs.pets.current)
    return petsAnchorOffsetY
  return 0
}

/**
 * 夹取内容尺寸并加上四周 pad。
 * 返回的是 **客户区** 目标尺寸（与 setContentSize 一致，避免 retina 外框差）。
 */
function clampPetSurfaceSize(
  surface: PetSurfaceId,
  width: number,
  height: number,
): { width: number, height: number } {
  const pad = PET_SURFACE_PAD[surface] * 2
  const min = PET_SURFACE_MIN[surface]
  const max = PET_SURFACE_MAX[surface]
  const w = Math.round(Math.min(max.width, Math.max(min.width, width + pad)))
  const h = Math.round(Math.min(max.height, Math.max(min.height, height + pad)))
  return { width: w, height: h }
}

function getPetSurfaceWindow(surface: PetSurfaceId): BrowserWindow | null {
  if (surface === 'pets')
    return windowRefs.pets.current
  if (surface === 'live2d')
    return windowRefs.live2d.current
  return windowRefs.bubble.current
}

/**
 * 将桌宠窗位置夹进当前显示器 workArea，避免长高 Live2D 在保中心后沉入 Dock 下无法拖回。
 * 窗比 workArea 更大时钉在 workArea 左上角。
 * @returns 是否发生了位移
 */
function clampWindowToWorkArea(win: BrowserWindow): boolean {
  if (win.isDestroyed())
    return false

  const bounds = win.getBounds()
  const display = screen.getDisplayMatching(bounds)
  const wa = display.workArea
  let nextX = bounds.x
  let nextY = bounds.y

  if (bounds.width >= wa.width) {
    nextX = wa.x
  }
  else {
    const minX = wa.x
    const maxX = wa.x + wa.width - bounds.width
    nextX = Math.min(Math.max(bounds.x, minX), maxX)
  }

  if (bounds.height >= wa.height) {
    nextY = wa.y
  }
  else {
    const minY = wa.y
    const maxY = wa.y + wa.height - bounds.height
    nextY = Math.min(Math.max(bounds.y, minY), maxY)
  }

  nextX = Math.round(nextX)
  nextY = Math.round(nextY)
  if (nextX === bounds.x && nextY === bounds.y)
    return false

  win.setPosition(nextX, nextY)
  return true
}

/**
 * 夹进 workArea 后，若是 pets/live2d，把实际视觉中心写回 pet-shared。
 */
function clampPetWindowToWorkAreaAndPersist(win: BrowserWindow): void {
  if (!clampWindowToWorkArea(win) || win.isDestroyed())
    return
  if (win !== windowRefs.live2d.current && win !== windowRefs.pets.current)
    return
  try {
    const [x, y] = win.getPosition()
    const [w, h] = win.getSize()
    getDatabase().setWindowPosition(
      'pet-shared',
      Math.round(x + w / 2),
      Math.round(y + h / 2),
    )
  }
  catch (error) {
    logger.warn('保存 pet-shared 中心失败（workArea clamp）', error)
  }
}

/**
 * 按渲染进程测量的可见内容，收缩桌宠 surface 窗口。
 * pets/live2d 保持视觉中心（pet-shared）；bubble 只改尺寸再由 positionBubbleAbove 贴合。
 */
export function setPetSurfaceContentSize(
  surface: PetSurfaceId,
  size: PetSurfaceContentSize,
): void {
  if (!Number.isFinite(size.width) || !Number.isFinite(size.height))
    return
  if (size.width <= 0 || size.height <= 0)
    return

  if (typeof size.anchorOffsetY === 'number' && Number.isFinite(size.anchorOffsetY)) {
    // 渲染上报的是「相对客户区顶」的头顶 Y。模型顶对齐后通常≈0；
    // 主进程 pad 扩在客户区四周，页面内容仍贴 top-left，故不额外加 pad。
    const offset = Math.max(0, size.anchorOffsetY)
    if (surface === 'live2d')
      live2dAnchorOffsetY = offset
    else if (surface === 'pets')
      petsAnchorOffsetY = offset
  }

  const win = getPetSurfaceWindow(surface)
  if (!win || win.isDestroyed())
    return

  const next = clampPetSurfaceSize(surface, size.width, size.height)

  // 一律按客户区比较/设置，避免 panel + retina 下 setBounds 外框与内容差导致
  // 实际显示区仍偏大、anchor 相对错位。
  const [currentCW, currentCH] = win.getContentSize()
  const sizeChanged = currentCW !== next.width || currentCH !== next.height

  if (surface === 'bubble') {
    if (sizeChanged)
      win.setContentSize(next.width, next.height)
    if (currentBubbleTarget && !currentBubbleTarget.isDestroyed() && win.isVisible())
      positionBubbleAbove(currentBubbleTarget)
    return
  }

  if (sizeChanged) {
    // 拖动中禁止改 x/y（会与 drag-move 抢位置造成「回弹」感）；仅改客户区尺寸
    if (isWindowDragging(win)) {
      win.setContentSize(next.width, next.height)
    }
    else {
      const [x, y] = win.getPosition()
      // 用客户区尺寸算视觉中心，与 setContentSize 同一坐标系
      const cx = x + currentCW / 2
      const cy = y + currentCH / 2
      const nextX = Math.round(cx - next.width / 2)
      const nextY = Math.round(cy - next.height / 2)
      win.setContentSize(next.width, next.height)
      win.setPosition(nextX, nextY)
      // 尺寸变化时同步 pet-shared 中心，避免仅靠 move 防抖导致切换模式跳动
      try {
        getDatabase().setWindowPosition('pet-shared', Math.round(cx), Math.round(cy))
      }
      catch (error) {
        logger.warn('保存 pet-shared 中心失败（content resize）', error)
      }
    }
  }

  // 无论是否改尺寸：保中心/增高后都可能压进 Dock；夹回 workArea
  if (!isWindowDragging(win))
    clampPetWindowToWorkAreaAndPersist(win)

  if (currentBubbleTarget === win && windowRefs.bubble.current?.isVisible())
    positionBubbleAbove(win)
}

/**
 * 将气泡窗口定位到目标窗口正上方（按锚点偏移指向模型头顶）。
 * 气泡窗尺寸只由文案固有宽高决定，可宽于宠物窗；此处只做位置与箭头，绝不按宠物宽缩气泡。
 * 屏幕边缘时 clamp 气泡窗到工作区内，箭头在气泡窗内滑动指向模型中心。
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

  // 水平：气泡底边中心对齐宠物/模型内容中心（气泡可更宽）
  const targetCenterX = x + w / 2
  const desiredBubbleX = targetCenterX - bw / 2

  // 拿目标窗口所在屏幕的工作区，避免多屏场景下气泡跑到主屏
  const targetBounds = targetWindow.getBounds()
  const display = screen.getDisplayMatching(targetBounds)
  const workArea = display.workArea
  const minX = workArea.x + BUBBLE_EDGE_MARGIN
  const maxX = workArea.x + workArea.width - bw - BUBBLE_EDGE_MARGIN
  // 气泡可比宠物更宽；仅平移窗体贴边，不改 bw。workArea 极窄时 maxX < minX，贴左缘。
  const bubbleX = Math.round(
    maxX < minX
      ? minX
      : Math.min(Math.max(desiredBubbleX, minX), maxX),
  )
  // 竖直：气泡底（箭头尖）贴在角色头顶 anchor 之上，保留小缝
  const bubbleY = Math.round(y + anchorOffset - bh - 4)

  bubble.setPosition(bubbleX, bubbleY)

  // 箭头水平位置（相对气泡窗口客户区），在圆角内 clamp；不移动卡片本身
  const arrowMin = BUBBLE_ARROW_HALF
  const arrowMax = Math.max(arrowMin, bw - BUBBLE_ARROW_HALF)
  const arrowX = Math.round(Math.min(Math.max(targetCenterX - bubbleX, arrowMin), arrowMax))
  bubble.webContents.send('bubble:set-arrow-x', arrowX)
}

/**
 * 显示气泡窗口（定位在目标窗口上方）
 * Codex 路径：showInactive + reassert floating 置顶，不抢焦点且不被 IDE 压层
 */
function showBubbleAbove(targetWindow: BrowserWindow): void {
  const bubble = ensureBubbleWindow()
  positionBubbleAbove(targetWindow)
  reassertPetSurfaceTop(bubble)
  bubble.showInactive()
}

/**
 * 隐藏气泡窗口
 */
export function hideBubbleWindow(): void {
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

// 渲染端上报模型头顶相对窗口顶边的偏移（兼容旧路径；新路径走 pet-shell:set-content-size）
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

// 桌宠壳：内容尺寸上报 → 各 surface setBounds（pets | live2d | bubble）
ipcMain.on('pet-shell:set-content-size', (_event, surfaceUnknown: unknown, sizeUnknown: unknown) => {
  if (surfaceUnknown !== 'pets' && surfaceUnknown !== 'live2d' && surfaceUnknown !== 'bubble')
    return
  if (sizeUnknown == null || typeof sizeUnknown !== 'object')
    return
  const raw = sizeUnknown as Record<string, unknown>
  const width = raw.width
  const height = raw.height
  if (typeof width !== 'number' || typeof height !== 'number')
    return
  const anchorOffsetY = raw.anchorOffsetY
  const size: PetSurfaceContentSize = {
    width,
    height,
    ...(typeof anchorOffsetY === 'number' && Number.isFinite(anchorOffsetY)
      ? { anchorOffsetY }
      : {}),
  }
  setPetSurfaceContentSize(surfaceUnknown, size)
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

/** 设置窗是否已完成首次主帧加载（hide 复用后仍视为 ready） */
const settingsReadyWindows = new WeakSet<BrowserWindow>()
/** 设置窗正在等待 did-finish-load 后展示，避免二次 toggle 误 hide 未显示窗口 */
let settingsPendingShow = false
let settingsShowFallbackTimer: NodeJS.Timeout | null = null
let settingsShowOnReady: (() => void) | null = null

const SETTINGS_SHOW_FALLBACK_MS = 3000

function clearSettingsShowFallback(): void {
  if (settingsShowFallbackTimer) {
    clearTimeout(settingsShowFallbackTimer)
    settingsShowFallbackTimer = null
  }
}

function detachSettingsShowOnReady(win: BrowserWindow): void {
  if (settingsShowOnReady && !win.isDestroyed()) {
    win.webContents.removeListener('did-finish-load', settingsShowOnReady)
  }
  settingsShowOnReady = null
}

function cancelSettingsPendingShow(win: BrowserWindow): void {
  settingsPendingShow = false
  clearSettingsShowFallback()
  detachSettingsShowOnReady(win)
  // 仍跟踪首次 load 完成，避免下次再误判为未 ready
  if (!settingsReadyWindows.has(win) && !win.isDestroyed()) {
    if (!win.webContents.isLoading()) {
      settingsReadyWindows.add(win)
      return
    }
    const markReady = (): void => {
      if (!win.isDestroyed())
        settingsReadyWindows.add(win)
    }
    win.webContents.once('did-finish-load', markReady)
  }
}

function showSettingsFocused(win: BrowserWindow): void {
  if (win.isDestroyed())
    return
  settingsPendingShow = false
  clearSettingsShowFallback()
  detachSettingsShowOnReady(win)
  settingsReadyWindows.add(win)
  if (win.isMinimized())
    win.restore()
  win.show()
  win.focus()
  win.moveTop()
}

/**
 * 打开/关闭设置窗。
 * - 内容未加载完时不立即 show，等 did-finish-load（带超时兜底）
 * - show 时 focus + moveTop，避免 skipTaskbar 时落到其它窗后面
 * - 加载中的二次 toggle 取消待打开，而不是 hide 一个尚未可见的窗口
 */
export function toggleSettings(): void {
  const win = ensureSettingsWindow()

  // 已真正可见：关闭
  if (win.isVisible() && !settingsPendingShow) {
    win.hide()
    return
  }

  // 正在等待首次展示：再次 toggle 取消打开（不误 hide）
  if (settingsPendingShow) {
    cancelSettingsPendingShow(win)
    return
  }

  // 仅在「从未 ready 且仍在加载」时等待；load 已结束但未标记 ready（如取消待打开）则立即 show
  const needsWait = !settingsReadyWindows.has(win) && win.webContents.isLoading()

  if (!needsWait) {
    showSettingsFocused(win)
    return
  }

  settingsPendingShow = true

  const onReady = (): void => {
    settingsShowOnReady = null
    clearSettingsShowFallback()
    if (win.isDestroyed())
      return
    settingsReadyWindows.add(win)
    if (!settingsPendingShow)
      return
    showSettingsFocused(win)
  }

  detachSettingsShowOnReady(win)
  settingsShowOnReady = onReady
  win.webContents.once('did-finish-load', onReady)

  // load 已在 isLoading 检查与 once 之间结束时，once 可能永远不触发 → 超时兜底
  clearSettingsShowFallback()
  settingsShowFallbackTimer = setTimeout(() => {
    settingsShowFallbackTimer = null
    detachSettingsShowOnReady(win)
    if (!settingsPendingShow || win.isDestroyed())
      return
    showSettingsFocused(win)
  }, SETTINGS_SHOW_FALLBACK_MS)
}

export function getBackgroundAudioWindow(): BrowserWindow | null {
  return windowRefs.backgroundAudio.current
}

export function toggleToChat(): void {
  const chat = ensureChatWindow()
  chat.show()
  chat.focus()
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
  // 再夹一次：content-size 可能尚未上报时窗仍是 builder 默认高，
  // 或上次残留在 Dock 下的位置需要拉回可见区
  clampPetWindowToWorkAreaAndPersist(win)
  // Codex：showInactive 不抢焦点；reassert floating + moveTop 防止被 IDE 盖住
  reassertPetSurfaceTop(win)
  win.showInactive()
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
  clampPetWindowToWorkAreaAndPersist(win)
  // Codex：showInactive 不抢焦点；reassert floating + moveTop 防止被 IDE 盖住
  reassertPetSurfaceTop(win)
  win.showInactive()
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

/** 恢复当前模式；显示窗口入口不切换用户选择的模式。 */
export function restoreCurrentModeWindow(): void {
  const ensureWindow = {
    main: ensureMainWindow,
    mini: ensureMiniWindow,
    chat: ensureChatWindow,
    live2d: ensureLive2dWindow,
    pets: ensurePetsWindow,
  }[currentDisplayMode]
  const win = ensureWindow()
  if (win.isMinimized())
    win.restore()

  if (currentDisplayMode === 'live2d' || currentDisplayMode === 'pets') {
    clampPetWindowToWorkAreaAndPersist(win)
    reassertPetSurfaceTop(win)
    win.showInactive()
    const bubble = ensureBubbleWindow()
    setupBubbleFollow(win)
    // 只恢复已有内容的可见气泡，隐藏的气泡由消息展示流程控制。
    if (bubble.isVisible())
      reassertPetSurfaceTop(bubble)
    return
  }

  win.show()
  win.focus()
  win.moveTop()
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
