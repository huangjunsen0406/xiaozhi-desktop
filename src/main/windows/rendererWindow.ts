import type { BrowserWindowConstructorOptions, WebPreferences } from 'electron'
import { join } from 'node:path'
import process from 'node:process'
import { is } from '@electron-toolkit/utils'
import { app, BrowserWindow, screen, shell } from 'electron'
import { getAppIcon } from '../utils/appIcon'
import { applyPetSurfaceWorkspaceAndTop } from './petSurfaceLayering'

export function createRendererPreferences(overrides: WebPreferences = {}): WebPreferences {
  return {
    preload: join(__dirname, '../preload/index.js'),
    sandbox: false,
    contextIsolation: true,
    nodeIntegration: false,
    webSecurity: true,
    ...overrides,
  }
}

export function loadRendererRoute(window: BrowserWindow, route: string): void {
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/${route}`)
  }
  else {
    window.loadFile(join(__dirname, '../renderer/index.html'), { hash: route })
  }
}

export function setAppWindowTitle(window: BrowserWindow): void {
  window.on('page-title-updated', event => event.preventDefault())
  window.setTitle(app.getName())
}

export function openWindowLinksExternally(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

export interface StandardWindowOptions extends Omit<BrowserWindowConstructorOptions, 'webPreferences'> {
  trafficLightPosition?: { x: number, y: number }
  webPreferences?: WebPreferences
}

/**
 * 构建带统一跨平台标题栏（macOS hiddenInset / Windows titleBarOverlay）、图标、外链与路由的标准窗口。
 */
export function createStandardWindow(route: string, options: StandardWindowOptions): BrowserWindow {
  const { trafficLightPosition, webPreferences, ...rest } = options
  const isMac = process.platform === 'darwin'
  const icon = getAppIcon()

  const win = new BrowserWindow({
    show: false,
    frame: isMac,
    title: app.getName(),
    ...(isMac
      ? {
          titleBarStyle: 'hiddenInset' as const,
          ...(trafficLightPosition ? { trafficLightPosition } : {}),
        }
      : {}),
    ...(process.platform === 'win32'
      ? { titleBarOverlay: { color: '#00000000', symbolColor: '#ffffff', height: 32 } as const }
      : {}),
    autoHideMenuBar: true,
    ...(icon ? { icon } : {}),
    ...rest,
    webPreferences: createRendererPreferences(webPreferences),
  })

  setAppWindowTitle(win)
  openWindowLinksExternally(win)
  loadRendererRoute(win, route)
  return win
}

export interface PetSurfaceWindowOptions {
  width: number
  height: number
  bottomMargin?: number
  rightMargin?: number
  movable: boolean
  hiddenInMissionControl: boolean
  includeIcon?: boolean
  moveTop?: boolean
  forwardMouseEvents: boolean
}

/**
 * 构建透明无边框、Codex Pet Surface 层级的桌宠/气泡窗口。
 */
export function createPetSurfaceWindow(route: string, options: PetSurfaceWindowOptions): BrowserWindow {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize
  const isDarwin = process.platform === 'darwin'
  const icon = options.includeIcon ? getAppIcon() : undefined

  const win = new BrowserWindow({
    x: screenWidth - options.width - (options.rightMargin ?? 50),
    y: screenHeight - options.height - (options.bottomMargin ?? 50),
    width: options.width,
    height: options.height,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: options.movable,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    acceptFirstMouse: true,
    focusable: false,
    hiddenInMissionControl: options.hiddenInMissionControl,
    type: isDarwin ? 'panel' : undefined,
    ...(isDarwin ? { enableLargerThanScreen: true } : {}),
    ...(icon ? { icon } : {}),
    webPreferences: createRendererPreferences({ devTools: is.dev }),
  })

  applyPetSurfaceWorkspaceAndTop(win, { moveTop: options.moveTop })
  win.setIgnoreMouseEvents(true, { forward: options.forwardMouseEvents })
  loadRendererRoute(win, route)
  return win
}
