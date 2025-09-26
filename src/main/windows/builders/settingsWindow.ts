import { join } from 'node:path'
import process from 'node:process'
import { is } from '@electron-toolkit/utils'
import { BrowserWindow, shell } from 'electron'
import linuxIcon from '../../../../resources/tray/icon-32.png?asset'
import winIcon from '../../../../resources/tray/icon.ico?asset'

export function buildSettingsWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 920,
    height: 600,
    show: false,
    frame: true,
    skipTaskbar: true,
    hiddenInMissionControl: true,
    resizable: false,
    movable: true,
    transparent: true,
    backgroundColor: '#00000000',
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
    },
  })

  win.hide()
  win.excludedFromShownWindowsMenu = true // 外部链接统一走系统默认浏览器
  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/settings`)
  }
  else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'settings' })
  }

  return win
}
