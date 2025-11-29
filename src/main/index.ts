import type { IpcContext } from './types/ipc'
import { join } from 'node:path'
import process from 'node:process'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, Menu, nativeImage } from 'electron'
import appIconPng from '../../resources/icon.png?asset'
import { registerAppIpcChannels, registerBasicIpcChannels } from './ipc'
import { getActivationService } from './services/ActivationService'
import { getApplication } from './services/Application'
import { registerTray } from './tray'
import { ensureBackgroundAudioWindow, ensureMainWindow, getCurrentDisplayMode, onDisplayModeChange, toggleSettings, toggleToChat, toggleToLive2d, toggleToMain, toggleToMini } from './windows/windowManager'

// 启用系统级回声消除特性
app.commandLine.appendSwitch(
  'enable-features',
  // Chrome-wide 回声消除 + 使用系统回放作 AEC 参考（取消系统任意进程的播放）
  'ChromeWideEchoCancellation,SystemLoopbackAsAecReference',
)

// 平台检查辅助函数
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
  if (!isMacOS)
    return

  app.setName('小智')
  ;(app as unknown as { setActivationPolicy?: (policy: string) => void }).setActivationPolicy?.('regular')

  if (hasDock()) {
    try {
      if (!app.isPackaged)
        setDevDockIconOnce()
      app.dock!.show()
    }
    catch (error) {
      console.log(error)
    }
  }
}

// 最早时机：ready 触发即兜底一次，确保创建任何窗口前已设定 Dock 图标（开发态）
app.on('ready', () => {
  setDevDockIconOnce()
})

// 窗口创建与 IPC 注册均已拆分至模块

/**
 * 构建 Dock 菜单（macOS）
 */
function buildDockMenu(): Menu {
  const currentMode = getCurrentDisplayMode()

  return Menu.buildFromTemplate([
    {
      label: '显示模式',
      submenu: [
        {
          label: '标准窗口',
          type: 'radio',
          checked: currentMode === 'main',
          click: () => {
            toggleToMain()
          },
        },
        {
          label: '迷你悬浮球',
          type: 'radio',
          checked: currentMode === 'mini',
          click: () => {
            toggleToMini()
          },
        },
        {
          label: '聊天视图',
          type: 'radio',
          checked: currentMode === 'chat',
          click: () => {
            toggleToChat()
          },
        },
        {
          label: 'Live2D 桌面宠物',
          type: 'radio',
          checked: currentMode === 'live2d',
          click: () => {
            toggleToLive2d()
          },
        },
      ],
    },
    { type: 'separator' },
    {
      label: '设置',
      click: () => {
        toggleSettings()
      },
    },
  ])
}

/**
 * 更新 Dock 菜单（macOS）
 */
function updateDockMenu(): void {
  if (isMacOS && hasDock()) {
    app.dock!.setMenu(buildDockMenu())
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // 先行确保 Dock 可见，尽量减少启动闪图
  ensureDockVisible()

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    // 新窗口创建时补刀一次（仅 dev），避免瞬时回落 Electron 图标
    setDevDockIconOnce()
    optimizer.watchWindowShortcuts(window)
    // 任何窗口的生命周期事件，都保持 Dock 常驻
    window.on('ready-to-show', ensureDockVisible)
    window.on('show', ensureDockVisible)
    window.on('minimize', ensureDockVisible)
    window.on('hide', ensureDockVisible)
    window.on('closed', ensureDockVisible)
  })

  // 注册基础 IPC 通道（不依赖 Application）
  registerBasicIpcChannels()
  registerTray()

  // macOS Dock 菜单
  if (isMacOS && hasDock()) {
    app.dock!.setMenu(buildDockMenu())

    // 注册显示模式变化回调
    onDisplayModeChange(() => {
      updateDockMenu()
    })
  }

  // macOS：二次保险
  ensureDockVisible()

  // 启动时检测激活状态（使用统一的激活服务）
  const activationService = getActivationService()
  activationService.handleStartup().then(async (result) => {
    if (result.success) {
      // 激活检测通过，先创建后台音频窗口
      console.log('[Main] 创建后台音频窗口...')
      const backgroundAudioWindow = ensureBackgroundAudioWindow()

      // 初始化 Application
      const application = getApplication()
      await application.initialize('websocket')

      const audioPlugin = application.getAudioPlugin()
      if (audioPlugin && backgroundAudioWindow) {
        audioPlugin.setBackgroundAudioWindow(backgroundAudioWindow)
        console.log('[Main] AudioPlugin 窗口引用已设置')
      }

      // 启动 Application
      await application.start()

      // 注册 Application 相关的 IPC 通道
      const ipcContext: IpcContext = { application }
      registerAppIpcChannels(ipcContext)

      // 创建主窗口
      ensureMainWindow()
    }
    else {
      // 激活检测失败，退出应用
      console.error('激活检测失败:', result.error || result.message)
      app.quit()
    }
  }).catch((error) => {
    console.error('激活检测出错:', error)
    // 激活检测异常，统一退出应用
    app.quit()
  })

  app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0)
      ensureMainWindow()
    ensureDockVisible()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (!isMacOS) {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
