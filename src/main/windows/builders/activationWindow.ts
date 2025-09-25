import { join } from 'node:path'
import process from 'node:process'
import { is } from '@electron-toolkit/utils'
import { BrowserWindow, shell } from 'electron'

export function buildActivationWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 530,
    height: 310,
    show: false,
    frame: false,
    // 透明背景，页面里渲染圆角卡片达到“无边框窗口”效果
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
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

  return win
}
