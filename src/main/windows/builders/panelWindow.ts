import process from 'node:process'
import { BrowserWindow } from 'electron'
import { getAppIcon } from '../../utils/appIcon'
import { createRendererPreferences, loadRendererRoute } from '../rendererWindow'

export function buildPanelWindow(): BrowserWindow {
  const icon = getAppIcon()
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
    ...(icon ? { icon } : {}),
    webPreferences: createRendererPreferences(),
  })

  win.setAlwaysOnTop(true, 'floating')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.excludedFromShownWindowsMenu = true
  win.hide()
  loadRendererRoute(win, 'panel')

  return win
}
