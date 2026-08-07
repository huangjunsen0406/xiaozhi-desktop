import { join } from 'node:path'
import process from 'node:process'
import { is } from '@electron-toolkit/utils'
import { app, BrowserWindow, shell } from 'electron'
import { getAppIcon } from '../../utils/appIcon'
import { handleWindowClose } from '../windowManager'

export function buildMainWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin'
  const icon = getAppIcon()

  const win = new BrowserWindow({
    width: 300,
    height: 400,
    show: false,
    frame: isMac,
    title: app.getName(),
    fullscreenable: false,
    skipTaskbar: false,
    hiddenInMissionControl: false,
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const } : {}),
    ...(process.platform === 'win32'
      ? { titleBarOverlay: { color: '#00000000', symbolColor: '#ffffff', height: 32 } as const }
      : {}),
    autoHideMenuBar: true,
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  })

  // 主窗显示由调用方（toggleToMain 等）显式驱动，避免 ready-to-show 异步触发导致
  // 在 mini/chat/live2d/pets 模式下首次 ensureMainWindow 时主窗闪现。
  win.on('page-title-updated', (event) => {
    event.preventDefault()
  })
  win.setTitle(app.getName())

  // 处理窗口关闭事件
  win.on('close', (event) => {
    handleWindowClose(event, win)
  })

  // 主窗不再强制置顶，避免压过系统层级（如截图 UI）
  win.setAlwaysOnTop(false)
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })
  win.excludedFromShownWindowsMenu = true
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/main`)
  }
  else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'main' })
  }

  return win
}
