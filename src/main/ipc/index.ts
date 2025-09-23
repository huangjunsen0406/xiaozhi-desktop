import { BrowserWindow, ipcMain } from 'electron'
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

  // 移动当前窗口（用于自定义拖拽）
  ipcMain.on('window:move-by', (event, dx: number, dy: number) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win)
      return
    const [x, y] = win.getPosition()
    win.setPosition(x + Math.round(dx), y + Math.round(dy))
  })

  // 调整当前窗口大小（用于 mini 悬停展开菜单）
  ipcMain.on('window:resize-to', (event, width: number, height?: number) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win)
      return
    const [, h] = win.getSize()
    const nextW = Math.max(1, Math.round(width))
    const nextH = Math.max(1, Math.round(height ?? h))
    win.setSize(nextW, nextH)
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
