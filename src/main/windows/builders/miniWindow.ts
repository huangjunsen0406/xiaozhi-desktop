import { join } from 'node:path'
import process from 'node:process'
import { is } from '@electron-toolkit/utils'
import { BrowserWindow } from 'electron'

export function buildMiniWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 72,
    height: 72,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    type: process.platform === 'darwin' ? 'panel' : undefined,
    resizable: false,
    movable: true,
    fullscreenable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  // 允许跨工作区显示（如果你想让悬浮球“全局悬浮”，保留；否则可以关）
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  // 悬浮球用较低层级即可（不要 screen-saver）
  win.setAlwaysOnTop(true, process.platform === 'darwin' ? 'status' : 'normal')
  win.moveTop()

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/mini`)
  }
  else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'mini' })
  }

  return win
}
