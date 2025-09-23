import { join } from 'node:path'
import process from 'node:process'
import { is } from '@electron-toolkit/utils'
import { BrowserWindow } from 'electron'

export function buildHoverWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 260,
    height: 150,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: true,
    resizable: false,
    movable: false,
    fullscreenable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  if (is.dev && process.env.ELECTRON_RENDERER_URL)
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/hover`)
  else
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'hover' })

  return win
}
