import type { IpcContext } from '../types/ipc'
import { BrowserWindow, ipcMain, shell } from 'electron'
import { registerHoverIpc } from '../hover/ipc'
import { registerDragBehavior } from '../windows/behaviors/DragBehavior'
import { showActivation, togglePanel, toggleSettings, toggleToMain, toggleToMini } from '../windows/windowManager'
import { registerActivationIpc } from './activationIpc'
import { registerAppIpc } from './appIpc'
import { registerAudioIpc } from './audioIpc'
import { registerBackgroundAudioIpc } from './backgroundAudioIpc'
import { registerCameraConfigIpc } from './cameraConfigIpc'
import { registerConfigIpc } from './configIpc'
import { registerEmotionIpc } from './emotionIpc'
import { registerThemeIpc } from './themeIpc'

/**
 * 注册基础 IPC 通道（不依赖 Application）
 * 包括: 悬停、激活、配置、音频、后台音频、窗口控制等
 */
export function registerBasicIpcChannels(): void {
  console.log('[IPC] 注册基础 IPC 通道...')

  registerHoverIpc()
  registerActivationIpc()
  registerConfigIpc()
  registerAudioIpc()
  registerBackgroundAudioIpc()
  registerEmotionIpc()
  registerCameraConfigIpc()
  registerThemeIpc()

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

  console.log('[IPC] ✓ 基础 IPC 通道已注册')
}

/**
 * 注册 Application 相关的 IPC 通道（依赖 Application 实例）
 * 包括: 监听控制、状态管理、文本发送、唤醒词等
 * @param context - IPC 上下文，包含 Application 实例
 */
export function registerAppIpcChannels(context: IpcContext): void {
  console.log('[IPC] 注册 Application IPC 通道...')
  registerAppIpc(context)
  console.log('[IPC] ✓ Application IPC 通道已注册')
}
