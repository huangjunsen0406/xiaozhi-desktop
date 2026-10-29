import { app, BrowserWindow } from 'electron'
import { getAppIcon } from '../../utils/appIcon'
import { createRendererPreferences, loadRendererRoute, openWindowLinksExternally } from '../rendererWindow'

export function buildActivationWindow(): BrowserWindow {
  const icon = getAppIcon()
  const win = new BrowserWindow({
    width: 530,
    height: 310,
    show: false,
    frame: false,
    title: app.getName(),
    skipTaskbar: false,
    hiddenInMissionControl: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: true,
    autoHideMenuBar: true,
    ...(icon ? { icon } : {}),
    webPreferences: createRendererPreferences(),
  })

  win.on('ready-to-show', () => win.show())
  openWindowLinksExternally(win)
  loadRendererRoute(win, 'activation')
  win.excludedFromShownWindowsMenu = true
  return win
}
