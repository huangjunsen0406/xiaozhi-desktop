import { join } from 'node:path'
import process from 'node:process'
import { is } from '@electron-toolkit/utils'
import { app, BrowserWindow, shell } from 'electron'
import { getAppIcon } from '../../utils/appIcon'

export function buildActivationWindow(): BrowserWindow {
  const icon = getAppIcon()

  const win = new BrowserWindow({
    width: 530,
    height: 310,
    show: false,
    frame: false, // 所有平台统一使用无边框
    title: app.getName(),
    // 激活窗口应该显示在任务栏/Dock 中
    skipTaskbar: false,
    hiddenInMissionControl: false,
    // 透明背景，页面里渲染圆角卡片达到"无边框窗口"效果
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: true,
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

  // 外部链接统一走系统默认浏览器
  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/activation`)
  }
  else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'activation' })
  }

  win.excludedFromShownWindowsMenu = true
  return win
}
