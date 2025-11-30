import { join } from 'node:path'
import process from 'node:process'
import { is } from '@electron-toolkit/utils'
import { BrowserWindow, shell } from 'electron'
import linuxIcon from '../../../../resources/tray/icon-32.png?asset'
import winIcon from '../../../../resources/tray/icon.ico?asset'

export function buildMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 300,
    height: 400,
    show: false,
    frame: true,
    fullscreenable: false,
    skipTaskbar: true,
    hiddenInMissionControl: true,
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const } : {}),
    ...(process.platform === 'win32'
      ? { titleBarOverlay: { color: '#00000000', symbolColor: '#ffffff', height: 40 } as const }
      : {}),
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon: linuxIcon as unknown as string } : {}),
    ...(process.platform === 'win32' ? { icon: winIcon as unknown as string } : {}),
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
