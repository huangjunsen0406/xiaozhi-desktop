import process from 'node:process'
import { BrowserWindow } from 'electron'
import { getAppIcon } from '../../utils/appIcon'
import { createRendererPreferences, loadRendererRoute } from '../rendererWindow'
import { handleWindowClose } from '../windowManager'

export function buildMiniWindow(): BrowserWindow {
  const icon = getAppIcon()
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
    hiddenInMissionControl: true,
    ...(icon ? { icon } : {}),
    webPreferences: createRendererPreferences(),
  })

  win.on('close', event => handleWindowClose(event, win))
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.setAlwaysOnTop(true, process.platform === 'darwin' ? 'status' : 'normal')
  win.moveTop()
  win.excludedFromShownWindowsMenu = true
  loadRendererRoute(win, 'mini')

  return win
}
