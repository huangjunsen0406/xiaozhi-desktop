import type { IpcContext } from '../types/ipc'
import { BrowserWindow, ipcMain, shell } from 'electron'
import { registerHoverIpc } from '../hover/ipc'
import { getLogger } from '../utils/logger'
import { registerDragBehavior } from '../windows/behaviors/DragBehavior'
import { getLive2dWindow, getPetsWindow, showActivation, togglePanel, toggleSettings, toggleToChat, toggleToLive2d, toggleToMain, toggleToMini, toggleToPets } from '../windows/windowManager'
import { registerActivationIpc } from './activationIpc'

import { registerAppIpc } from './appIpc'
import { registerAudioIpc } from './audioIpc'
import { registerBackgroundAudioIpc } from './backgroundAudioIpc'
import { registerCameraConfigIpc } from './cameraConfigIpc'
import { registerChatIpc } from './chatIpc'
import { registerClipboardIpcChannels } from './clipboardIpc'
import { registerConfigIpc } from './configIpc'
import { registerEmotionIpc, setEmotionBroadcastCallback } from './emotionIpc'
import { registerMcpToolsIpc } from './mcpToolsIpc'
import { registerModelIpc } from './modelIpc'
import { registerMusicConfigIpc } from './musicConfigIpc'
import { registerMusicIpc } from './musicIpc'
import { registerPetsIpc } from './petsIpc'
import { registerThemeIpc } from './themeIpc'

const logger = getLogger('Index')

/**
 * 注册基础 IPC 通道（不依赖 ServiceContainer）
 * 包括: 悬停、激活、配置、音频、后台音频、窗口控制等
 */
export function registerBasicIpcChannels(): void {
  logger.info('注册基础 IPC 通道...')

  registerHoverIpc()
  registerActivationIpc()
  registerConfigIpc()
  registerAudioIpc()
  registerBackgroundAudioIpc()
  registerEmotionIpc()
  registerCameraConfigIpc()
  registerThemeIpc()
  registerChatIpc()
  registerMusicIpc()
  registerMusicConfigIpc()

  registerModelIpc()
  registerPetsIpc()
  registerMcpToolsIpc()
  registerClipboardIpcChannels()

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

  // Live2D 窗口
  ipcMain.on('window:toggle-live2d', () => {
    toggleToLive2d()
  })

  ipcMain.on('live2d:set-ignore-mouse', (_, ignore: boolean) => {
    const win = getLive2dWindow()
    if (win) {
      win.setIgnoreMouseEvents(ignore, { forward: ignore })
    }
  })

  // 精灵宠物窗口
  ipcMain.on('window:toggle-pets', () => {
    toggleToPets()
  })

  ipcMain.on('pets:set-ignore-mouse', (_, ignore: boolean) => {
    const win = getPetsWindow()
    if (win) {
      win.setIgnoreMouseEvents(ignore, { forward: ignore })
    }
  })

  // 显示模式切换
  ipcMain.handle('window:switch-display-mode', async (_, mode: 'main' | 'mini' | 'chat' | 'live2d' | 'pets') => {
    if (mode === 'mini') {
      toggleToMini()
    }
    else if (mode === 'chat') {
      toggleToChat()
    }
    else if (mode === 'live2d') {
      toggleToLive2d()
    }
    else if (mode === 'pets') {
      toggleToPets()
    }
    else {
      toggleToMain()
    }
  })

  logger.info('基础 IPC 通道已注册')
}

/**
 * 注册应用相关的 IPC 通道（依赖 ServiceContainer 实例）
 * 包括: 监听控制、状态管理、文本发送、唤醒词等
 * @param context - IPC 上下文，包含 ServiceContainer 实例
 */
export function registerAppIpcChannels(context: IpcContext): void {
  logger.info('注册应用 IPC 通道...')
  registerAppIpc(context)

  // 注入表情广播回调（通过 UIPlugin）
  const pluginManager = context.container.getPluginManager()
  const uiPlugin = pluginManager.getPlugin('UIPlugin')
  const uiPluginWithEmotion = uiPlugin as unknown as { broadcastEmotion?: (emotionType: string) => void }
  if (uiPluginWithEmotion && typeof uiPluginWithEmotion.broadcastEmotion === 'function') {
    setEmotionBroadcastCallback((emotionType: string) => {
      uiPluginWithEmotion.broadcastEmotion!(emotionType)
    })
    logger.info('表情广播回调已注入到 emotionIpc')
  }
  else {
    logger.warn('UIPlugin 未找到或不支持 broadcastEmotion，表情广播将使用降级方案')
  }

  logger.info('应用 IPC 通道已注册')
}
