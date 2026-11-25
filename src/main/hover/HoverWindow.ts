import process from 'node:process'
import { BrowserWindow } from 'electron'
import { createRendererPreferences, loadRendererRoute } from '../windows/rendererWindow'

/**
 * 创建悬浮菜单窗（260×288，无边框透明置顶）
 */
export function buildHoverWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 260,
    height: 288,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: true,
    resizable: false,
    movable: false,
    fullscreenable: false,
    hiddenInMissionControl: true,
    skipTaskbar: true,
    type: process.platform === 'darwin' ? 'panel' : undefined,
    webPreferences: createRendererPreferences(),
  })

  win.setAlwaysOnTop(true, 'status')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.excludedFromShownWindowsMenu = true
  loadRendererRoute(win, 'hover')

  return win
}
