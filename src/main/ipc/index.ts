import { BrowserWindow, ipcMain, screen } from 'electron'
import { registerHoverIpc } from '../hover/ipc'
import { togglePanel, toggleToMain, toggleToMini } from '../windows/windowManager'

export function registerIpcChannels(): void {
  registerHoverIpc()
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

  // 原生全局坐标拖动（避免跨屏缩放差导致的偏移）
  const dragState = new WeakMap<BrowserWindow, { offsetX: number, offsetY: number }>()
  ipcMain.on('window:drag-start', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win)
      return
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
    const nextX = Math.round(cursor.x - state.offsetX)
    const nextY = Math.round(cursor.y - state.offsetY)
    win.setPosition(nextX, nextY)
  })

  ipcMain.on('window:drag-end', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win)
      dragState.delete(win)
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
}
