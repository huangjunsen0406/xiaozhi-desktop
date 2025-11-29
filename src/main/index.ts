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

app.on('ready', () => {
  setDevDockIconOnce()
})

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

function updateDockMenu(): void {
  if (isMacOS && hasDock()) {
    app.dock!.setMenu(buildDockMenu())
  }
}

app.whenReady().then(() => {
  ensureDockVisible()
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    setDevDockIconOnce()
    optimizer.watchWindowShortcuts(window)
    window.on('ready-to-show', ensureDockVisible)
    window.on('show', ensureDockVisible)
    window.on('minimize', ensureDockVisible)
    window.on('hide', ensureDockVisible)
    window.on('closed', ensureDockVisible)
  })

  registerBasicIpcChannels()
  registerTray()

  if (isMacOS && hasDock()) {
    app.dock!.setMenu(buildDockMenu())

    onDisplayModeChange(() => {
      updateDockMenu()
    })
  }

  ensureDockVisible()

  const activationService = getActivationService()
  activationService.handleStartup().then(async (result) => {
    if (result.success) {
      console.log('[Main] 创建后台音频窗口...')
      const backgroundAudioWindow = ensureBackgroundAudioWindow()

      const application = getApplication()
      await application.initialize('websocket')

      const audioPlugin = application.getAudioPlugin()
      if (audioPlugin && backgroundAudioWindow) {
        audioPlugin.setBackgroundAudioWindow(backgroundAudioWindow)
        console.log('[Main] AudioPlugin 窗口引用已设置')
      }

      await application.start()

      const ipcContext: IpcContext = { application }
      registerAppIpcChannels(ipcContext)

      ensureMainWindow()
    }
    else {
      console.error('激活检测失败:', result.error || result.message)
      app.quit()
    }
  }).catch((error) => {
    console.error('激活检测出错:', error)
    app.quit()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0)
      ensureMainWindow()
    ensureDockVisible()
  })
})

app.on('window-all-closed', () => {
  if (!isMacOS) {
    app.quit()
  }
})
