import type { IpcContext } from './types/ipc'
import { join } from 'node:path'
import process from 'node:process'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, Menu, nativeImage, session } from 'electron'
import appIconPng from '../../resources/icon.png?asset'
import { applyAecCommandLineFeatures } from './audio/AecPolicy'
import { initializeAudioRuntime } from './audio/AudioRuntime'
import { createServiceContainer, getServiceContainer } from './core/ServiceContainer'
import { registerAppIpcChannels, registerBasicIpcChannels } from './ipc'
import { ActivationService } from './services/ActivationService'
import {
  startCareReminderService,
  stopCareReminderService,
} from './services/CareReminderService'
import { initializeConfigManager } from './services/configManagerDB'
import { initializeDatabase } from './services/database'
import { initializeDeviceFingerprint } from './services/deviceFingerprintDB'

import { initUpdateService, scheduleSilentUpdateCheck } from './services/UpdateService'
import { registerTray } from './tray'
import { getLogger, initLogger, shutdownLogger } from './utils/logger'
import { buildAppMenu, buildDisplayModeMenu } from './utils/menuBuilder'
import { migrateFromEnvIfNeeded, resolveAllPaths } from './utils/paths'
import { registerModelProtocolHandler, registerModelProtocolScheme } from './utils/registerModelProtocol'
import { ensureBackgroundAudioWindow, ensureMainWindow, getBackgroundAudioWindow, getCurrentDisplayMode, getCurrentModeWindow, onDisplayModeChange, setIsQuitting, toggleToChat, toggleToLive2d, toggleToMain, toggleToMini, toggleToPets } from './windows/windowManager'

const logger = getLogger('Index')
const APP_DISPLAY_NAME = '小智'

let isQuittingFlag = false

app.setName(APP_DISPLAY_NAME)

// 按 aec-boot.json / 默认 app 设置 Chromium AEC features（须在 ready 前）
const bootAecMode = applyAecCommandLineFeatures()
console.info('[AecPolicy] boot aecMode=', bootAecMode)

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

// 初始化日志系统（在单实例锁检查前，确保 logger 可用）
initLogger()

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
      // 如果窗口不存在，创建并显示主窗口
      const main = ensureMainWindow()
      main.show()
    }
  })
}

app.whenReady().then(async () => {
  logger.info('应用启动', { version: app.getVersion(), platform: process.platform })

  // PATHS：env 覆盖生效时从默认目录复制迁移（不删源、不迁 DB）
  try {
    migrateFromEnvIfNeeded()
    logger.info('PATHS 解析', resolveAllPaths())
  }
  catch (error) {
    logger.warn('PATHS 启动迁移跳过/失败', error)
  }

  // 进程级资源显式初始化（禁止懒 getInstance）
  // 顺序：paths → db → audioRuntime → config/fingerprint → activation → IPC → container
  initializeDatabase()
  initializeAudioRuntime()
  initializeConfigManager()
  initializeDeviceFingerprint()
  const activationService = ActivationService.create()
  logger.info('Database / AudioRuntime / Config / DeviceFingerprint / Activation 已显式初始化')

  // 检查并处理企业版代理问题
  if (process.env.HTTP_PROXY || process.env.HTTPS_PROXY) {
    logger.warn('检测到系统代理配置:', {
      HTTP_PROXY: process.env.HTTP_PROXY,
      HTTPS_PROXY: process.env.HTTPS_PROXY,
    })
    logger.info('尝试绕过代理以解决企业版网络问题...')

    try {
      // 对特定域名设置 direct 连接（不使用代理）
      await session.defaultSession.setProxy({
        mode: 'direct', // 直连，不使用代理
      })
      logger.info('已设置直连模式（绕过系统代理）')
    }
    catch (error) {
      logger.error('设置代理配置失败', error)
    }
  }

  // 注册自定义协议处理器
  registerModelProtocolHandler()

  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    setDevDockIconOnce()
    optimizer.watchWindowShortcuts(window)
    // Only bind essential events to reduce overhead
    window.on('show', ensureDockVisible)
    window.on('closed', ensureDockVisible)
  })

  // IPC 注册在 db/config/activation create 之后（handler 依赖 get* 访问器）
  registerBasicIpcChannels()
  initUpdateService()
  registerTray()
  Menu.setApplicationMenu(buildAppMenu())

  if (isMacOS && hasDock()) {
    app.dock!.setMenu(buildDisplayModeMenu(false))

    onDisplayModeChange(() => {
      app.dock!.setMenu(buildDisplayModeMenu(false))
    })
  }

  ensureDockVisible()

  // 初始化激活基础信息
  const initResult = await activationService.initializeBasic()

  if (!initResult.success) {
    logger.warn('基础设备信息初始化失败，但继续启动应用', initResult.error)
  }

  // 创建后台音频窗口
  logger.info('创建后台音频窗口...')
  const backgroundAudioWindow = ensureBackgroundAudioWindow()

  // 显式创建并初始化 ServiceContainer（进程唯一根）
  const container = createServiceContainer()
  await container.initialize('websocket')

  // 设置音频插件的后台窗口
  if (backgroundAudioWindow) {
    container.setAudioPluginBackgroundWindow(backgroundAudioWindow)
  }

  await container.start()

  // 启动静默检查更新（有新版本才提示；失败忽略）
  scheduleSilentUpdateCheck(5000)

  const ipcContext: IpcContext = { container }
  registerAppIpcChannels(ipcContext)

  // 根据上次保存的显示模式恢复对应窗口
  const savedMode = getCurrentDisplayMode()
  switch (savedMode) {
    case 'mini':
      // 不再预先 ensureMainWindow，避免 builder ready-to-show 时序问题；
      // toggleToMini 只在 main 已存在时 hide 它。
      toggleToMini()
      break
    case 'chat':
      toggleToChat()
      break
    case 'live2d':
      toggleToLive2d()
      break
    case 'pets':
      toggleToPets()
      break
    default:
      toggleToMain()
      break
  }

  // 桌宠本地关怀提醒（无语音/不写对话；依赖 display mode + deviceState）
  try {
    await startCareReminderService()
  }
  catch (error) {
    logger.error('启动关怀提醒服务失败', error)
  }

  // 异步检查激活状态
  activationService.checkActivationStatus().then((result) => {
    if (result.error) {
      logger.warn('激活状态检查失败（已忽略）', result.error)
    }
    else {
      logger.info('激活状态检查完成', result.message)
    }
    // OTA 可能更新了 websocket_url，通知 ProtocolManager 刷新内存配置
    container.reloadProtocolConfig()
  }).catch((error) => {
    logger.error('激活状态检查出错（已忽略）', error)
  })

  app.on('activate', () => {
    // macOS 点击 Dock 图标时，显示当前模式对应的窗口
    const windows = BrowserWindow.getAllWindows()
    if (windows.length === 0) {
      const main = ensureMainWindow()
      main.show()
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
        // 如果当前模式的窗口不存在，创建并显示主窗口
        const main = ensureMainWindow()
        main.show()
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
  if (isQuittingFlag)
    return
  isQuittingFlag = true
  event.preventDefault()
  setIsQuitting(true) // 设置退出标志，允许窗口关闭
  logger.info('应用正在退出...')

  // 清理后台音频系统
  try {
    const backgroundAudioWindow = getBackgroundAudioWindow()
    if (backgroundAudioWindow && !backgroundAudioWindow.isDestroyed()) {
      logger.info('正在清理后台音频系统...')
      backgroundAudioWindow.webContents.send('audio:command', 'cleanup')
      // 等待一小段时间让 cleanup 完成
      await new Promise(resolve => setTimeout(resolve, 100))
      logger.info('后台音频系统已清理')
    }
  }
  catch (error) {
    logger.error('清理后台音频系统失败', error)
  }

  // 停止本地关怀提醒调度
  try {
    stopCareReminderService()
  }
  catch (error) {
    logger.error('停止关怀提醒服务失败', error)
  }

  // 关闭 ServiceContainer（插件、协议、任务等）
  try {
    const container = getServiceContainer()
    await container.shutdown()
    logger.info('ServiceContainer 已关闭')
  }
  catch (error) {
    logger.error('ServiceContainer 关闭失败', error)
  }

  await shutdownLogger()
  app.exit(0)
})
