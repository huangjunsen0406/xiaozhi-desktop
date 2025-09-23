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

  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.moveTop()

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/mini`)
  }
  else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'mini' })
  }

  return win
}
