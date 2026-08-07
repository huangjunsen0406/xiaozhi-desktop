import { join } from 'node:path'
import process from 'node:process'
import { is } from '@electron-toolkit/utils'
import { app, BrowserWindow, shell } from 'electron'
import { getAppIcon } from '../../utils/appIcon'
import { getIsQuitting } from '../windowManager'

export function buildSettingsWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin'
  const icon = getAppIcon()

  const win = new BrowserWindow({
    width: 920,
    height: 600,
    minWidth: 720,
    minHeight: 480,
    show: false,
    frame: isMac,
    title: app.getName(),
    // 设置是辅助窗：不占任务栏/Mission Control，但允许拖动、缩放、最大化、全屏
    skipTaskbar: true,
    hiddenInMissionControl: true,
    minimizable: true,
    maximizable: true,
    resizable: true,
    fullscreenable: true,
    movable: true,
    ...(isMac
      ? {
          titleBarStyle: 'hiddenInset' as const,
          // 与 SettingsView 顶部拖拽区对齐
          trafficLightPosition: { x: 16, y: 12 },
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
    },
  })

  // 阻止页面 <title> 覆盖窗口标题
  win.on('page-title-updated', (event) => {
    event.preventDefault()
  })
  win.setTitle(app.getName())

  // 显示由 toggleSettings 控制，避免 load 未完成时提前 show 导致空白/失焦。
  // 全平台关闭改为 hide 复用，避免 Win/Linux 销毁后下次冷启动再次竞态。
  win.on('close', (event) => {
    if (!getIsQuitting()) {
      event.preventDefault()
      win.hide()
    }
  })

  win.excludedFromShownWindowsMenu = true
  // 外部链接统一走系统默认浏览器
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
