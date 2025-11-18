import type { IpcContext } from '../types/ipc'
import { BrowserWindow, ipcMain, shell } from 'electron'
import { registerHoverIpc } from '../hover/ipc'
import { registerDragBehavior } from '../windows/behaviors/DragBehavior'
import { showActivation, togglePanel, toggleSettings, toggleToMain, toggleToMini } from '../windows/windowManager'
import { registerActivationIpc } from './activationIpc'
import { registerAppIpc } from './appIpc'
import { registerAudioIpc } from './audioIpc'
import { registerBackgroundAudioIpc } from './backgroundAudioIpc'
import { registerConfigIpc } from './configIpc'

/**
 * 注册所有 IPC 通道
 * @param context - 可选的 IPC 上下文，如果提供则使用依赖注入模式
 */
export function registerIpcChannels(context?: IpcContext): void {
  registerHoverIpc()
  registerActivationIpc()
  registerConfigIpc()
  registerAudioIpc()

  // Application 控制 IPC - 使用依赖注入
  if (context) {
    registerAppIpc(context)
  }
  else {
    // 兼容旧模式：延迟注册，等待 Application 初始化
    console.warn('[IPC] 未提供 IpcContext，appIpc 将延迟注册')
  }

  registerBackgroundAudioIpc() // 后台音频窗口控制 IPC

  // 注册窗口拖动行为（提取到独立模块）
  registerDragBehavior()

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

  // 显示模式切换
  ipcMain.handle('window:switch-display-mode', async (_, mode: 'main' | 'mini') => {
    if (mode === 'mini') {
      toggleToMini()
    }
    else {
      toggleToMain()
    }
  })
}
