import { join } from 'node:path'
import process from 'node:process'
import { is } from '@electron-toolkit/utils'
import { app, BrowserWindow, shell } from 'electron'
import { getAppIcon } from '../../utils/appIcon'
import { handleWindowClose } from '../windowManager'

export function buildChatWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin'
  const icon = getAppIcon()

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 560,
    show: false,
    frame: isMac,
    title: app.getName(),
    // 三键保持可用：mac 上 fullscreenable:false 会让绿键变灰
    minimizable: true,
    maximizable: true,
    resizable: true,
    fullscreenable: true,
    skipTaskbar: false,
    hiddenInMissionControl: false,
    ...(isMac
      ? {
          titleBarStyle: 'hiddenInset' as const,
          // 与 ChatView 顶部 h-11 对齐，避免红绿灯压住「历史对话」
          trafficLightPosition: { x: 16, y: 18 },
        }
      : {}),
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

  // 阻止页面 <title> 覆盖窗口标题（index.html 曾写成 Electron）
  win.on('page-title-updated', (event) => {
    event.preventDefault()
  })
  win.setTitle(app.getName())

  win.on('ready-to-show', () => {
    win.show()
  })

  win.on('close', (event) => {
    handleWindowClose(event, win)
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
