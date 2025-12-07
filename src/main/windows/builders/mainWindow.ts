import { join } from 'node:path'
import process from 'node:process'
import { is } from '@electron-toolkit/utils'
import { app, BrowserWindow, nativeImage, shell } from 'electron'
import { handleWindowClose } from '../windowManager'

function getAppIcon() {
  if (process.platform === 'win32') {
    // Windows: 使用 icon.ico
    return join(__dirname, '../../resources/icon.ico')
  }
  else if (process.platform === 'linux') {
    // Linux: 使用 icon.png
    return nativeImage.createFromPath(join(__dirname, '../../resources/icon.png'))
  }
  return undefined
}

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

  win.on('ready-to-show', () => {
    win.show()
  })

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
