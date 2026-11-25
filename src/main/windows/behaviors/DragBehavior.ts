/**
 * 窗口拖动行为模块
 * - mini：拖动中 lerp 磁吸 + drag-end 硬吸附（threshold 100）
 * - pets / live2d：拖动中自由放置，仅 drag-end 硬吸附（threshold 64）
 */
import { BrowserWindow, ipcMain, screen } from 'electron'
import { reassertPetSurfaceTop } from '../petSurfaceLayering'

interface DragState {
  offsetX: number
  offsetY: number
}

const dragState = new WeakMap<BrowserWindow, DragState>()
const MINI_SNAP_THRESHOLD = 100
const PET_SNAP_END_THRESHOLD = 64

export function isWindowDragging(win: BrowserWindow): boolean {
  return dragState.has(win)
}

function getWindowUrl(win: BrowserWindow): string {
  try {
    return win.webContents.getURL()
  }
  catch {
    return ''
  }
}

function isPetSurfaceUrl(url: string): boolean {
  return url.includes('#/pets') || url.includes('#/live2d')
}

function isMiniUrl(url: string): boolean {
  return url.includes('#/mini')
}

function lerpBy(distance: number, threshold: number): number {
  return Math.max(0, Math.min(1, (threshold - distance) / threshold)) * 0.35
}

function resolveAxisSnap(
  pos: number,
  size: number,
  minEdge: number,
  maxEdge: number,
  threshold: number,
  lerp: boolean,
): number | undefined {
  const dMin = Math.abs(pos - minEdge)
  const dMax = Math.abs(maxEdge - (pos + size))
  if (dMin <= threshold)
    return lerp ? Math.round(pos + (minEdge - pos) * lerpBy(dMin, threshold)) : minEdge
  if (dMax <= threshold)
    return lerp ? Math.round(pos + (maxEdge - size - pos) * lerpBy(dMax, threshold)) : maxEdge - size
  return undefined
}

function computeSnap(
  x: number,
  y: number,
  width: number,
  height: number,
  workArea: Electron.Rectangle,
  threshold: number,
  lerp: boolean,
): { x?: number, y?: number } {
  return {
    x: resolveAxisSnap(x, width, workArea.x, workArea.x + workArea.width, threshold, lerp),
    y: resolveAxisSnap(y, height, workArea.y, workArea.y + workArea.height, threshold, lerp),
  }
}

export function registerDragBehavior(): void {
  ipcMain.on('window:drag-start', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win)
      return

    const cursor = screen.getCursorScreenPoint()
    const [wx, wy] = win.getPosition()
    dragState.set(win, { offsetX: cursor.x - wx, offsetY: cursor.y - wy })

    if (isPetSurfaceUrl(getWindowUrl(win)))
      reassertPetSurfaceTop(win)
  })

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

    if (isMiniUrl(getWindowUrl(win))) {
      const [w, h] = win.getSize()
      const workArea = screen.getDisplayNearestPoint(cursor).workArea
      const snapped = computeSnap(nextX, nextY, w, h, workArea, MINI_SNAP_THRESHOLD, true)
      nextX = snapped.x ?? nextX
      nextY = snapped.y ?? nextY
    }

    win.setPosition(nextX, nextY)
  })

  ipcMain.on('window:drag-end', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win)
      return

    dragState.delete(win)

    const url = getWindowUrl(win)
    if (!isMiniUrl(url) && !isPetSurfaceUrl(url))
      return

    const [w, h] = win.getSize()
    const [cx, cy] = win.getPosition()
    const cursor = screen.getCursorScreenPoint()
    const workArea = screen.getDisplayNearestPoint(cursor).workArea
    const threshold = isPetSurfaceUrl(url) ? PET_SNAP_END_THRESHOLD : MINI_SNAP_THRESHOLD

    const { x, y } = computeSnap(cx, cy, w, h, workArea, threshold, false)
    if (x != null || y != null)
      win.setPosition(x ?? cx, y ?? cy)
  })
}
