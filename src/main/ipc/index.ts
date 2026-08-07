import type { IpcContext } from '../types/ipc'
import process from 'node:process'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { registerHoverIpc } from '../hover/ipc'
import { getLogger } from '../utils/logger'
import { registerDragBehavior } from '../windows/behaviors/DragBehavior'
import { getCurrentDisplayMode, getLive2dWindow, getPetsWindow, setIsQuitting, showActivation, togglePanel, toggleSettings, toggleToChat, toggleToLive2d, toggleToMain, toggleToMini, toggleToPets } from '../windows/windowManager'
import { registerActivationIpc } from './activationIpc'

import { registerAppIpc } from './appIpc'
import { registerAudioIpc } from './audioIpc'
import { registerBackgroundAudioIpc } from './backgroundAudioIpc'
import { registerCameraConfigIpc } from './cameraConfigIpc'
import { registerCareReminderIpc } from './careReminderIpc'
import { registerChatIpc } from './chatIpc'
import { registerClipboardIpcChannels } from './clipboardIpc'
import { registerConfigIpc } from './configIpc'
import { registerEmotionIpc, setEmotionBroadcastCallback } from './emotionIpc'
import { registerMcpToolsIpc } from './mcpToolsIpc'
import { createIpcHandler, success } from './middleware'
import { registerModelIpc } from './modelIpc'
import { registerMusicConfigIpc } from './musicConfigIpc'
import { registerMusicIpc } from './musicIpc'
import { registerPetsIpc } from './petsIpc'
import { registerThemeIpc } from './themeIpc'
import { registerUpdateIpc } from './updateIpc'

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
  registerCareReminderIpc()
  registerMcpToolsIpc()
  registerUpdateIpc()
  registerClipboardIpcChannels()

  // 注册窗口拖动行为（提取到独立模块）
  registerDragBehavior()

  // 窗口控制
  ipcMain.on('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.on('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed())
      return
    // 已在系统全屏时先退出，再走 maximize，避免卡在全屏无法还原
    if (win.isFullScreen()) {
      win.setFullScreen(false)
      return
    }
    if (!win.isMaximized())
      win.maximize()
  })

  ipcMain.on('window:unmaximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed())
      return
    if (win.isFullScreen()) {
      win.setFullScreen(false)
      return
    }
    if (win.isMaximized())
      win.unmaximize()
  })

  ipcMain.on('window:toggle-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed())
      return
    // 全屏优先退出；否则在 maximize / unmaximize 间切换
    if (win.isFullScreen()) {
      win.setFullScreen(false)
      return
    }
    win.isMaximized() ? win.unmaximize() : win.maximize()
  })

  ipcMain.on('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  ipcMain.on('window:open-external', (_, url) => {
    if (/^https?:\/\/.+/i.test(url))
      void shell.openExternal(url)
  })

  // 打开 macOS「录屏与系统录音」设置（系统级 AEC 引导）
  createIpcHandler({
    channel: 'app:open-screen-recording-settings',
    handler: async () => {
      if (process.platform !== 'darwin') {
        return success({ opened: false, reason: 'not_darwin' as const })
      }
      // 经典深链在较新 macOS 仍可用，落到「隐私与安全性 → 录屏」
      const url = 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
      try {
        await shell.openExternal(url)
        return success({ opened: true as const })
      }
      catch (error) {
        logger.warn('打开录屏隐私设置失败', error)
        // 退到隐私与安全性总页
        try {
          await shell.openExternal('x-apple.systempreferences:com.apple.preference.security')
          return success({ opened: true as const, fallback: true as const })
        }
        catch (fallbackError) {
          logger.error('打开系统隐私设置失败', fallbackError)
          throw fallbackError
        }
      }
    },
  })

  // 重启应用（AEC system 启动 feature 交叉后完整生效）
  createIpcHandler({
    channel: 'app:relaunch',
    handler: async () => {
      logger.info('应用即将 relaunch（设置变更）')
      setIsQuitting(true)
      app.relaunch()
      app.exit(0)
      return success(true)
    },
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

  // 退出应用（Hover / 快捷菜单）
  ipcMain.on('app:quit', () => {
    app.quit()
  })

  // Live2D 窗口
  ipcMain.on('window:toggle-live2d', () => {
    toggleToLive2d()
  })

  // 统一 click-through（live2d / pets）。
  const setPetClickThrough = (target: 'live2d' | 'pets', ignore: boolean): void => {
    const win = target === 'live2d' ? getLive2dWindow() : getPetsWindow()
    if (win)
      win.setIgnoreMouseEvents(ignore, { forward: ignore })
  }

  ipcMain.on('window:set-click-through', (_, target: unknown, ignore: unknown) => {
    if ((target !== 'live2d' && target !== 'pets') || typeof ignore !== 'boolean')
      return
    setPetClickThrough(target, ignore)
  })

  // 精灵宠物窗口
  ipcMain.on('window:toggle-pets', () => {
    toggleToPets()
  })

  // 读取当前显示模式
  createIpcHandler({
    channel: 'window:get-display-mode',
    handler: async () => {
      return success(getCurrentDisplayMode())
    },
  })

  // 显示模式切换
  createIpcHandler({
    channel: 'window:switch-display-mode',
    schema: {
      mode: {
        type: 'string',
        required: true,
        custom: (value) => {
          const allowed = ['main', 'mini', 'chat', 'live2d', 'pets']
          return typeof value === 'string' && allowed.includes(value)
            ? true
            : 'mode 必须是 main | mini | chat | live2d | pets'
        },
      },
    },
    handler: async (_event, modeUnknown: unknown) => {
      const mode = String(modeUnknown)
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
      return success()
    },
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
