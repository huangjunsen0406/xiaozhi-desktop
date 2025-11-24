import { join } from 'node:path'
import process from 'node:process'
import { is } from '@electron-toolkit/utils'
import { BrowserWindow, shell } from 'electron'
import linuxIcon from '../../../../resources/tray/icon-32.png?asset'
import winIcon from '../../../../resources/tray/icon.ico?asset'

export function buildChatWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    frame: true,
    fullscreenable: false,
    skipTaskbar: false,
    hiddenInMissionControl: false,
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const } : {}),
    ...(process.platform === 'win32'
      ? { titleBarOverlay: { color: '#00000000', symbolColor: '#ffffff', height: 40 } as const }
      : {}),
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon: linuxIcon as unknown as string } : {}),
    ...(process.platform === 'win32' ? { icon: winIcon as unknown as string } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  })

  win.on('ready-to-show', () => {
    win.show()
  })

  win.setAlwaysOnTop(false)
  win.setVisibleOnAllWorkspaces(false)
  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/chat`)
  }
  else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'chat' })
  }

  return win
}
