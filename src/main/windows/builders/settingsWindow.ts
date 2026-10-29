import process from 'node:process'
import { app, BrowserWindow } from 'electron'
import { getAppIcon } from '../../utils/appIcon'
import { createRendererPreferences, loadRendererRoute, openWindowLinksExternally, setAppWindowTitle } from '../rendererWindow'
import { getIsQuitting } from '../windowManager'

export function buildSettingsWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin'
  const icon = getAppIcon()

  const win = new BrowserWindow({
    width: 920,
    height: 600,
    minWidth: 720,
    minHeight: 480,
    show: false,
    frame: isMac,
    title: app.getName(),
    skipTaskbar: true,
    hiddenInMissionControl: true,
    minimizable: true,
    maximizable: true,
    resizable: true,
    fullscreenable: true,
    movable: true,
    ...(isMac
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: { x: 16, y: 12 },
        }
      : {}),
    ...(process.platform === 'win32'
      ? { titleBarOverlay: { color: '#00000000', symbolColor: '#ffffff', height: 32 } as const }
      : {}),
    autoHideMenuBar: true,
    ...(icon ? { icon } : {}),
    webPreferences: createRendererPreferences(),
  })

  setAppWindowTitle(win)
  // 显示由 toggleSettings 控制；关闭时隐藏复用，避免重新加载时的显示竞态。
  win.on('close', (event) => {
    if (!getIsQuitting()) {
      event.preventDefault()
      win.hide()
    }
  })
  win.excludedFromShownWindowsMenu = true
  openWindowLinksExternally(win)
  loadRendererRoute(win, 'settings')

  return win
}
