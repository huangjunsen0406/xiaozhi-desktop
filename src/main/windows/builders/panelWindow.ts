import { join } from 'node:path'
import process from 'node:process'
import { is } from '@electron-toolkit/utils'
import { BrowserWindow } from 'electron'

export function buildPanelWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 920,
    height: 180,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: true,
    resizable: false,
    movable: true,
    skipTaskbar: true,
    hiddenInMissionControl: true,
    type: process.platform === 'darwin' ? 'panel' : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  win.setAlwaysOnTop(true, 'floating')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.excludedFromShownWindowsMenu = true
  win.hide()

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/panel`)
  }
  else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'panel' })
  }

  return win
}
