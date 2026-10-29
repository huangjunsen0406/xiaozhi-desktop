import process from 'node:process'
import { app, BrowserWindow } from 'electron'
import { getAppIcon } from '../../utils/appIcon'
import { createRendererPreferences, loadRendererRoute, openWindowLinksExternally, setAppWindowTitle } from '../rendererWindow'
import { handleWindowClose } from '../windowManager'

export function buildMainWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin'
  const icon = getAppIcon()

  const win = new BrowserWindow({
    width: 300,
    height: 400,
    show: false,
    frame: isMac,
    title: app.getName(),
    fullscreenable: false,
    skipTaskbar: false,
    hiddenInMissionControl: false,
    ...(isMac ? { titleBarStyle: 'hiddenInset' as const } : {}),
    ...(process.platform === 'win32'
      ? { titleBarOverlay: { color: '#00000000', symbolColor: '#ffffff', height: 32 } as const }
      : {}),
    autoHideMenuBar: true,
    ...(icon ? { icon } : {}),
    webPreferences: createRendererPreferences(),
  })

  // 显示由 toggleToMain 等调用方控制，避免首次创建时在其它模式下闪现。
  setAppWindowTitle(win)
  win.on('close', event => handleWindowClose(event, win))
  win.setAlwaysOnTop(false)
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  openWindowLinksExternally(win)
  win.excludedFromShownWindowsMenu = true
  loadRendererRoute(win, 'main')

  return win
}
