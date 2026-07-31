/**
 * 窗口拖动行为模块
 * 提供窗口拖动和边缘吸附功能
 */
import { BrowserWindow, ipcMain, screen } from 'electron'

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

// 默认吸附配置
const DEFAULT_SNAP_CONFIG: SnapConfig = {
  threshold: 100,
  enabled: true,
}

/**
 * 计算吸附插值比例
 */
function lerpBy(distance: number, threshold: number): number {
  return Math.max(0, Math.min(1, (threshold - distance) / threshold)) * 0.35
}

/**
 * 计算吸附后的位置
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
 * 计算最终吸附目标位置
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
 * 检查窗口是否应该启用吸附
 */
function shouldEnableSnap(win: BrowserWindow): boolean {
  const config = snapConfig.get(win)
  if (config && !config.enabled) {
    return false
  }

  // 默认仅对三种悬浮窗口启用吸附。
  const url = win.webContents.getURL()
  return url.includes('#/mini') || url.includes('#/live2d') || url.includes('#/pets')
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

    // 检查是否启用吸附
    if (shouldEnableSnap(win)) {
      const [w, h] = win.getSize()
      const workArea = screen.getDisplayNearestPoint(cursor).workArea
      const config = snapConfig.get(win) || DEFAULT_SNAP_CONFIG

      const snapped = calculateSnappedPosition(nextX, nextY, w, h, workArea, config.threshold)
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
    if (shouldEnableSnap(win)) {
      const [w, h] = win.getSize()
      const [cx, cy] = win.getPosition()
      const cursor = screen.getCursorScreenPoint()
      const workArea = screen.getDisplayNearestPoint(cursor).workArea
      const config = snapConfig.get(win) || DEFAULT_SNAP_CONFIG

      const { targetX, targetY } = calculateSnapTarget(cx, cy, w, h, workArea, config.threshold)

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
