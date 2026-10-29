import process from 'node:process'
import { app, BrowserWindow } from 'electron'
import { getAppIcon } from '../../utils/appIcon'
import { createRendererPreferences, loadRendererRoute, openWindowLinksExternally, setAppWindowTitle } from '../rendererWindow'
import { handleWindowClose } from '../windowManager'

export function buildChatWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin'
  const icon = getAppIcon()

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 560,
    show: false,
    frame: isMac,
    title: app.getName(),
    minimizable: true,
    maximizable: true,
    resizable: true,
    fullscreenable: true,
    skipTaskbar: false,
    hiddenInMissionControl: false,
    ...(isMac
      ? {
          titleBarStyle: 'hiddenInset' as const,
          // 与聊天页顶部拖拽区对齐。
          trafficLightPosition: { x: 16, y: 18 },
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
  win.on('ready-to-show', () => win.show())
  win.on('close', event => handleWindowClose(event, win))
  win.setAlwaysOnTop(false)
  win.setVisibleOnAllWorkspaces(false)
  openWindowLinksExternally(win)
  loadRendererRoute(win, 'chat')

  return win
}
