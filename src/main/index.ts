import type { IpcContext } from './types/ipc'
import { join } from 'node:path'
import process from 'node:process'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, Menu, nativeImage } from 'electron'
import appIconPng from '../../resources/icon.png?asset'
import { registerAppIpcChannels, registerBasicIpcChannels } from './ipc'
import { getActivationService } from './services/ActivationService'
import { getAnalyticsService } from './services/AnalyticsService'
import { getApplication } from './services/Application'
import { registerTray } from './tray'
import { getLogger, initLogger, shutdownLogger } from './utils/logger'
import { buildAppMenu, buildDisplayModeMenu } from './utils/menuBuilder'
import { registerModelProtocolHandler, registerModelProtocolScheme } from './utils/registerModelProtocol'
import { ensureBackgroundAudioWindow, ensureMainWindow, getBackgroundAudioWindow, getCurrentModeWindow, onDisplayModeChange, setIsQuitting } from './windows/windowManager'

const logger = getLogger('Index')
const APP_DISPLAY_NAME = '小智'

app.setName(APP_DISPLAY_NAME)

app.commandLine.appendSwitch(
  'enable-features',
  'ChromeWideEchoCancellation,SystemLoopbackAsAecReference',
)

const isMacOS = process.platform === 'darwin'
const hasDock = () => isMacOS && !!app.dock

function resolveAppIconPath(): string {
  const asset = appIconPng as unknown as string
  const base = app.isPackaged ? process.resourcesPath : app.getAppPath()
  const fallback = join(base, 'resources', 'icon.png')
  return asset || fallback
}

let devDockImg: Electron.NativeImage | null = null
function setDevDockIconOnce(): void {
  if (!isMacOS || !hasDock() || !is.dev)
    return
  if (!devDockImg) {
    const p = resolveAppIconPath()
    const img = nativeImage.createFromPath(p)
    if (!img.isEmpty())
      devDockImg = img
  }
  if (devDockImg)
    app.dock!.setIcon(devDockImg)
}

function ensureDockVisible(): void {
  if (!isMacOS) {
    return
  }

  ;(app as unknown as { setActivationPolicy?: (policy: string) => void }).setActivationPolicy?.('regular')

  if (hasDock()) {
    try {
      if (!app.isPackaged)
        setDevDockIconOnce()
      app.dock!.show()
    }
    catch (error) {
      logger.error('设置 Dock 图标失败', error)
    }
  }
}

app.on('ready', () => {
  setDevDockIconOnce()
})

// 在 app ready 之前注册自定义协议 scheme
registerModelProtocolScheme()

// 单实例锁定：防止多开
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  // 如果获取锁失败，说明已经有实例在运行，直接退出
  logger.info('应用已在运行，退出当前实例')
  app.quit()
}
else {
  // 当第二个实例尝试启动时，唤醒第一个实例的窗口
  app.on('second-instance', (_event, _commandLine, _workingDirectory) => {
    logger.info('检测到第二个实例启动，唤醒现有窗口')

    // 获取当前显示模式对应的窗口
    const targetWindow = getCurrentModeWindow()

    if (targetWindow && !targetWindow.isDestroyed()) {
      // 如果窗口最小化，恢复它
      if (targetWindow.isMinimized()) {
        targetWindow.restore()
      }

      // 显示并聚焦窗口
      targetWindow.show()
      targetWindow.focus()

      // macOS: 确保 Dock 图标显示
      ensureDockVisible()
    }
    else {
      // 如果窗口不存在，创建主窗口
      ensureMainWindow()
    }
  })
}

app.whenReady().then(async () => {
  // 初始化日志系统
  initLogger()
  logger.info('应用启动', { version: app.getVersion(), platform: process.platform })

  // 注册自定义协议处理器
  registerModelProtocolHandler()

  // 初始化埋点服务
  const analytics = getAnalyticsService()
  await analytics.initialize()

  // 上报应用启动事件
  analytics.track('app_start', {
    version: app.getVersion(),
    platform: process.platform,
    isDev: !app.isPackaged,
  })

  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    setDevDockIconOnce()
    optimizer.watchWindowShortcuts(window)
    // Only bind essential events to reduce overhead
    window.on('show', ensureDockVisible)
    window.on('closed', ensureDockVisible)
  })

  registerBasicIpcChannels()
  registerTray()
  Menu.setApplicationMenu(buildAppMenu())

  if (isMacOS && hasDock()) {
    app.dock!.setMenu(buildDisplayModeMenu(false))

    onDisplayModeChange(() => {
      app.dock!.setMenu(buildDisplayModeMenu(false))
    })
  }

  ensureDockVisible()

  const activationService = getActivationService()
  activationService.handleStartup().then(async (result) => {
    if (result.success) {
      logger.info('创建后台音频窗口...')
      const backgroundAudioWindow = ensureBackgroundAudioWindow()

      const application = getApplication()
      await application.initialize('websocket')

      const audioPlugin = application.getAudioPlugin()
      if (audioPlugin && backgroundAudioWindow) {
        audioPlugin.setBackgroundAudioWindow(backgroundAudioWindow)
        logger.info('AudioPlugin 窗口引用已设置')
      }

      await application.start()

      const ipcContext: IpcContext = { application }
      registerAppIpcChannels(ipcContext)

      ensureMainWindow()
    }
    else {
      logger.error('激活检测失败', new Error(result.error || result.message))
      app.quit()
    }
  }).catch((error) => {
    logger.error('激活检测出错', error)
    app.quit()
  })

  app.on('activate', () => {
    // macOS 点击 Dock 图标时，显示当前模式对应的窗口
    const windows = BrowserWindow.getAllWindows()
    if (windows.length === 0) {
      ensureMainWindow()
    }
    else {
      // 获取当前显示模式对应的窗口
      const targetWindow = getCurrentModeWindow()

      if (targetWindow && !targetWindow.isDestroyed()) {
        if (!targetWindow.isVisible()) {
          targetWindow.show()
        }
        targetWindow.focus()
      }
      else {
        // 如果当前模式的窗口不存在，创建主窗口
        ensureMainWindow()
      }
    }
    ensureDockVisible()
  })
})

app.on('window-all-closed', () => {
  if (!isMacOS) {
    app.quit()
  }
})

// 应用退出前清理所有资源
app.on('before-quit', async (event) => {
  event.preventDefault()
  setIsQuitting(true) // 设置退出标志，允许窗口关闭
  logger.info('应用正在退出...')

  // 清理后台音频系统
  try {
    const backgroundAudioWindow = getBackgroundAudioWindow()
    if (backgroundAudioWindow && !backgroundAudioWindow.isDestroyed()) {
      logger.info('正在清理后台音频系统...')
      backgroundAudioWindow.webContents.send('audio:command', 'cleanup')
      // 等待一小段时间让cleanup完成
      await new Promise(resolve => setTimeout(resolve, 100))
      logger.info('后台音频系统已清理')
    }
  }
  catch (error) {
    logger.error('清理后台音频系统失败', error)
  }

  // 上报应用退出事件并等待发送完成
  const analytics = getAnalyticsService()
  analytics.track('app_quit')
  await analytics.shutdown()

  await shutdownLogger()
  app.exit(0)
})
