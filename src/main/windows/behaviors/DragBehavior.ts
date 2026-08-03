/**
 * 窗口拖动行为模块
 * - 全窗口：IPC 拖动（drag-start / drag-move / drag-end）
 * - mini：拖动中 lerp 磁吸 + drag-end 硬吸附（threshold 100）
 * - pets / live2d：拖动中自由放置，仅 drag-end 硬吸附（threshold 64）
 *   避免靠近 Stage Manager / IDE 侧栏时被连续磁吸「拽走」的回弹感
 * - pets / live2d 拖动开始时 reassert alwaysOnTop，避免被 IDE 压层
 */
import { BrowserWindow, ipcMain, screen } from 'electron'
import { reassertPetSurfaceTop } from '../petSurfaceLayering'

/**
 * 拖动状态
 */
interface DragState {
  offsetX: number
  offsetY: number
}

/**
 * 吸附配置
 */
interface SnapConfig {
  /** 吸附距离阈值 */
  threshold: number
  /** 是否启用吸附 */
  enabled: boolean
}

// 拖动状态映射
const dragState = new WeakMap<BrowserWindow, DragState>()
// 吸附配置映射
const snapConfig = new WeakMap<BrowserWindow, SnapConfig>()

/**
 * 当前是否正在拖动该窗口（content-size setBounds 应跳过改 x/y）
 */
export function isWindowDragging(win: BrowserWindow): boolean {
  return dragState.has(win)
}

function isPetSurfaceUrl(url: string): boolean {
  return url.includes('#/pets') || url.includes('#/live2d')
}

function isMiniUrl(url: string): boolean {
  return url.includes('#/mini')
}

function isSnapEligibleUrl(url: string): boolean {
  return isMiniUrl(url) || isPetSurfaceUrl(url)
}

// 默认吸附配置（mini 拖动中 + 结束）
const DEFAULT_SNAP_CONFIG: SnapConfig = {
  threshold: 100,
  enabled: true,
}

// pets / live2d 仅 drag-end 吸附，阈值略小，贴边更克制
const PET_SNAP_END_THRESHOLD = 64

/**
 * 计算吸附插值比例
 */
function lerpBy(distance: number, threshold: number): number {
  return Math.max(0, Math.min(1, (threshold - distance) / threshold)) * 0.35
}

/**
 * 计算吸附后的位置（拖动中 lerp 辅助）
 */
function calculateSnappedPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  workArea: Electron.Rectangle,
  threshold: number,
): { x: number, y: number } {
  let nextX = x
  let nextY = y

  const rightEdge = workArea.x + workArea.width
  const bottomEdge = workArea.y + workArea.height

  const dLeft = Math.abs(x - workArea.x)
  const dRight = Math.abs(rightEdge - (x + width))
  const dTop = Math.abs(y - workArea.y)
  const dBottom = Math.abs(bottomEdge - (y + height))

  if (dLeft <= threshold) {
    nextX = Math.round(x + (workArea.x - x) * lerpBy(dLeft, threshold))
  }
  else if (dRight <= threshold) {
    nextX = Math.round(x + (rightEdge - width - x) * lerpBy(dRight, threshold))
  }

  if (dTop <= threshold) {
    nextY = Math.round(y + (workArea.y - y) * lerpBy(dTop, threshold))
  }
  else if (dBottom <= threshold) {
    nextY = Math.round(y + (bottomEdge - height - y) * lerpBy(dBottom, threshold))
  }

  return { x: nextX, y: nextY }
}

/**
 * 计算最终吸附目标位置（drag-end 硬吸附）
 */
function calculateSnapTarget(
  x: number,
  y: number,
  width: number,
  height: number,
  workArea: Electron.Rectangle,
  threshold: number,
): { targetX?: number, targetY?: number } {
  const rightEdge = workArea.x + workArea.width
  const bottomEdge = workArea.y + workArea.height

  const dLeft = Math.abs(x - workArea.x)
  const dRight = Math.abs(rightEdge - (x + width))
  const dTop = Math.abs(y - workArea.y)
  const dBottom = Math.abs(bottomEdge - (y + height))

  let targetX: number | undefined
  let targetY: number | undefined

  if (dLeft <= threshold) {
    targetX = workArea.x
  }
  else if (dRight <= threshold) {
    targetX = rightEdge - width
  }

  if (dTop <= threshold) {
    targetY = workArea.y
  }
  else if (dBottom <= threshold) {
    targetY = bottomEdge - height
  }

  return { targetX, targetY }
}

/**
 * 读取 URL 安全封装（webContents 未就绪时返回空串）
 */
function getWindowUrl(win: BrowserWindow): string {
  try {
    return win.webContents.getURL()
  }
  catch {
    return ''
  }
}

/**
 * 是否允许边缘吸附（受 configureWindowSnap.enabled 覆盖）。
 *
 * Hybrid 策略：
 * - mini：拖动中 lerp + drag-end 硬吸附
 * - pets / live2d：仅 drag-end 硬吸附（见 shouldEnableMoveSnap / shouldEnableEndSnap）
 */
function isSnapEnabled(win: BrowserWindow): boolean {
  const config = snapConfig.get(win)
  if (config && !config.enabled) {
    return false
  }
  return isSnapEligibleUrl(getWindowUrl(win))
}

/**
 * 拖动中是否做 lerp 磁吸。仅 mini，避免 pets/live2d 被侧栏边缘连续拽走。
 */
function shouldEnableMoveSnap(win: BrowserWindow): boolean {
  if (!isSnapEnabled(win))
    return false
  return isMiniUrl(getWindowUrl(win))
}

/**
 * 松手时是否硬吸附到 workArea 边缘。
 * mini / pets / live2d 均启用。
 */
function shouldEnableEndSnap(win: BrowserWindow): boolean {
  return isSnapEnabled(win)
}

function resolveSnapThreshold(win: BrowserWindow): number {
  const config = snapConfig.get(win)
  if (config?.threshold != null)
    return config.threshold

  const url = getWindowUrl(win)
  if (isPetSurfaceUrl(url))
    return PET_SNAP_END_THRESHOLD

  return DEFAULT_SNAP_CONFIG.threshold
}

/**
 * 注册窗口拖动 IPC 通道
 */
export function registerDragBehavior(): void {
  // 拖动开始
  ipcMain.on('window:drag-start', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win)
      return

    const cursor = screen.getCursorScreenPoint()
    const [wx, wy] = win.getPosition()
    dragState.set(win, { offsetX: cursor.x - wx, offsetY: cursor.y - wy })

    // 桌宠 surface：拖动开始时重新声明 floating 置顶，避免拖过 IDE 时被侧栏盖住
    if (isPetSurfaceUrl(getWindowUrl(win)))
      reassertPetSurfaceTop(win)
  })

  // 拖动移动
  ipcMain.on('window:drag-move', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win)
      return

    const state = dragState.get(win)
    if (!state)
      return

    const cursor = screen.getCursorScreenPoint()
    let nextX = Math.round(cursor.x - state.offsetX)
    let nextY = Math.round(cursor.y - state.offsetY)

    // mini：拖动中 lerp 磁吸；pets/live2d：自由跟手，不做连续吸附
    if (shouldEnableMoveSnap(win)) {
      const [w, h] = win.getSize()
      const workArea = screen.getDisplayNearestPoint(cursor).workArea
      const threshold = resolveSnapThreshold(win)

      const snapped = calculateSnappedPosition(nextX, nextY, w, h, workArea, threshold)
      nextX = snapped.x
      nextY = snapped.y
    }

    win.setPosition(nextX, nextY)
  })

  // 拖动结束
  ipcMain.on('window:drag-end', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win)
      return

    dragState.delete(win)

    // 结束时直接落到目标边缘，确保下一次拖动不会被残留动画打断。
    // pets/live2d 仅在此阶段吸附，贴近边缘才 settle，中间区域保持落点。
    if (shouldEnableEndSnap(win)) {
      const [w, h] = win.getSize()
      const [cx, cy] = win.getPosition()
      const cursor = screen.getCursorScreenPoint()
      const workArea = screen.getDisplayNearestPoint(cursor).workArea
      const threshold = resolveSnapThreshold(win)

      const { targetX, targetY } = calculateSnapTarget(cx, cy, w, h, workArea, threshold)

      if (targetX != null || targetY != null) {
        win.setPosition(targetX ?? cx, targetY ?? cy)
      }
    }
  })
}

/**
 * 为窗口配置吸附行为
 */
export function configureWindowSnap(win: BrowserWindow, config: Partial<SnapConfig>): void {
  const currentConfig = snapConfig.get(win) || { ...DEFAULT_SNAP_CONFIG }
  snapConfig.set(win, { ...currentConfig, ...config })
}

/**
 * 启用窗口吸附
 */
export function enableWindowSnap(win: BrowserWindow): void {
  configureWindowSnap(win, { enabled: true })
}

/**
 * 禁用窗口吸附
 */
export function disableWindowSnap(win: BrowserWindow): void {
  configureWindowSnap(win, { enabled: false })
}

/**
 * 清理窗口拖动状态
 */
export function cleanupDragState(win: BrowserWindow): void {
  dragState.delete(win)
  snapConfig.delete(win)
}
