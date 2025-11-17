import { BrowserWindow, ipcMain, screen, shell } from 'electron'
import { registerHoverIpc } from '../hover/ipc'
import { showActivation, togglePanel, toggleSettings, toggleToMain, toggleToMini } from '../windows/windowManager'
import { registerActivationIpc } from './activationIpc'
import { registerAppIpc } from './appIpc'
import { registerAudioIpc } from './audioIpc'
import { registerConfigIpc } from './configIpc'

export function registerIpcChannels(): void {
  registerHoverIpc()
  registerActivationIpc()
  registerConfigIpc()
  registerAudioIpc()
  registerAppIpc() // Application 控制 IPC
  // 窗口控制
  ipcMain.on('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.on('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && !win.isMaximized())
      win.maximize()
  })

  ipcMain.on('window:unmaximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && win.isMaximized())
      win.unmaximize()
  })

  ipcMain.on('window:toggle-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win)
      return
    win.isMaximized() ? win.unmaximize() : win.maximize()
  })

  ipcMain.on('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  ipcMain.on('window:open-external', (_, url) => {
    if (/^https?:\/\/.+/i.test(url))
      void shell.openExternal(url)
  })

  // 原生全局坐标拖动（避免跨屏缩放差导致的偏移）
  const dragState = new WeakMap<BrowserWindow, { offsetX: number, offsetY: number }>()
  const snapTimer = new WeakMap<BrowserWindow, NodeJS.Timeout>()

  function stopSnap(win: BrowserWindow) {
    const t = snapTimer.get(win)
    if (t) {
      clearInterval(t)
      snapTimer.delete(win)
    }
  }

  function animateSnapTo(win: BrowserWindow, targetX?: number, targetY?: number) {
    stopSnap(win)
    // 约 240ms 缓动到边缘，采用逐帧插值的 ease-out 感受
    const interval = 16
    const maxSteps = Math.ceil(240 / interval)
    let steps = 0
    const timer = setInterval(() => {
      steps += 1
      const [cx, cy] = win.getPosition()
      const nextX = targetX == null ? cx : Math.round(cx + (targetX - cx) * 0.35)
      const nextY = targetY == null ? cy : Math.round(cy + (targetY - cy) * 0.35)
      win.setPosition(nextX, nextY)
      const doneX = targetX == null || Math.abs(nextX - targetX) <= 1
      const doneY = targetY == null || Math.abs(nextY - targetY) <= 1
      if ((doneX && doneY) || steps >= maxSteps) {
        win.setPosition(targetX ?? nextX, targetY ?? nextY)
        stopSnap(win)
      }
    }, interval)
    snapTimer.set(win, timer)
  }

  ipcMain.on('window:drag-start', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win)
      return
    stopSnap(win)
    const cursor = screen.getCursorScreenPoint()
    const [wx, wy] = win.getPosition()
    dragState.set(win, { offsetX: cursor.x - wx, offsetY: cursor.y - wy })
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

    // 仅对 mini 窗口启用边缘吸附（带少量缓动趋近）
    const url = win.webContents.getURL()
    const isMini = url.includes('#/mini')
    if (isMini) {
      const [w, h] = win.getSize()
      const nextRect = { x: nextX, y: nextY, width: w, height: h }
      const work = screen.getDisplayMatching(nextRect).workArea
      const SNAP = 100
      const rightEdge = work.x + work.width
      const bottomEdge = work.y + work.height
      const dLeft = Math.abs(nextX - work.x)
      const dRight = Math.abs(rightEdge - (nextX + w))
      const dTop = Math.abs(nextY - work.y)
      const dBottom = Math.abs(bottomEdge - (nextY + h))

      // 距离越近，插值比例越大（最多 0.35），产生“靠近边缘逐渐吸附”的感觉
      const lerpBy = (d: number) => Math.max(0, Math.min(1, (SNAP - d) / SNAP)) * 0.35

      if (dLeft <= SNAP)
        nextX = Math.round(nextX + (work.x - nextX) * lerpBy(dLeft))
      else if (dRight <= SNAP)
        nextX = Math.round(nextX + (rightEdge - w - nextX) * lerpBy(dRight))

      if (dTop <= SNAP)
        nextY = Math.round(nextY + (work.y - nextY) * lerpBy(dTop))
      else if (dBottom <= SNAP)
        nextY = Math.round(nextY + (bottomEdge - h - nextY) * lerpBy(dBottom))
    }

    win.setPosition(nextX, nextY)
  })

  ipcMain.on('window:drag-end', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win)
      return
    const url = win.webContents.getURL()
    const isMini = url.includes('#/mini')
    dragState.delete(win)

    // 结束时若在 SNAP 范围内，补一个短动画缓到边缘
    if (isMini) {
      const [w, h] = win.getSize()
      const [cx, cy] = win.getPosition()
      const currentRect = { x: cx, y: cy, width: w, height: h }
      const work = screen.getDisplayMatching(currentRect).workArea
      const SNAP = 100
      const rightEdge = work.x + work.width
      const bottomEdge = work.y + work.height
      const dLeft = Math.abs(cx - work.x)
      const dRight = Math.abs(rightEdge - (cx + w))
      const dTop = Math.abs(cy - work.y)
      const dBottom = Math.abs(bottomEdge - (cy + h))

      let targetX: number | undefined
      let targetY: number | undefined
      if (dLeft <= SNAP)
        targetX = work.x
      else if (dRight <= SNAP)
        targetX = rightEdge - w
      if (dTop <= SNAP)
        targetY = work.y
      else if (dBottom <= SNAP)
        targetY = bottomEdge - h

      if (targetX != null || targetY != null)
        animateSnapTo(win, targetX, targetY)
    }
  })

  // 主视图
  ipcMain.on('window:toggle-to-mini', () => {
    toggleToMini()
  })

  ipcMain.on('window:toggle-to-main', () => {
    toggleToMain()
  })

  // 输入框
  ipcMain.on('panel:toggle', () => {
    togglePanel()
  })

  // 激活窗口
  ipcMain.on('activation:show', () => {
    showActivation()
  })

  // 设置窗口
  ipcMain.on('window:toggle-settings', () => {
    toggleSettings()
  })
}
