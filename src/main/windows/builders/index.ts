import { join } from 'node:path'
import process from 'node:process'
import { is } from '@electron-toolkit/utils'
import { app, BrowserWindow } from 'electron'
import { getAppIcon } from '../../utils/appIcon'
import { getLogger } from '../../utils/logger'
import {
  createPetSurfaceWindow,
  createRendererPreferences,
  createStandardWindow,
  loadRendererRoute,
  openWindowLinksExternally,
} from '../rendererWindow'

const logger = getLogger('WindowBuilders')

export function buildMainWindow(): BrowserWindow {
  const win = createStandardWindow('main', {
    width: 300,
    height: 400,
    fullscreenable: false,
    skipTaskbar: false,
    hiddenInMissionControl: false,
  })
  win.setAlwaysOnTop(false)
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.excludedFromShownWindowsMenu = true
  return win
}

export function buildChatWindow(): BrowserWindow {
  const win = createStandardWindow('chat', {
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 560,
    minimizable: true,
    maximizable: true,
    resizable: true,
    fullscreenable: true,
    skipTaskbar: false,
    hiddenInMissionControl: false,
    trafficLightPosition: { x: 16, y: 18 },
  })
  win.on('ready-to-show', () => win.show())
  win.setAlwaysOnTop(false)
  win.setVisibleOnAllWorkspaces(false)
  return win
}

export function buildSettingsWindow(): BrowserWindow {
  const win = createStandardWindow('settings', {
    width: 920,
    height: 600,
    minWidth: 720,
    minHeight: 480,
    skipTaskbar: true,
    hiddenInMissionControl: true,
    minimizable: true,
    maximizable: true,
    resizable: true,
    fullscreenable: true,
    movable: true,
    trafficLightPosition: { x: 16, y: 12 },
  })
  win.excludedFromShownWindowsMenu = true
  return win
}

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

  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.setAlwaysOnTop(true, process.platform === 'darwin' ? 'status' : 'normal')
  win.moveTop()
  win.excludedFromShownWindowsMenu = true
  loadRendererRoute(win, 'mini')
  return win
}

export function buildLive2dWindow(): BrowserWindow {
  return createPetSurfaceWindow('live2d', {
    width: 200,
    height: 400,
    movable: true,
    hiddenInMissionControl: false,
    includeIcon: true,
    forwardMouseEvents: true,
  })
}

export function buildPetsWindow(): BrowserWindow {
  const win = createPetSurfaceWindow('pets', {
    width: 150,
    height: 180,
    movable: true,
    hiddenInMissionControl: false,
    includeIcon: true,
    forwardMouseEvents: true,
  })

  if (is.dev) {
    win.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F12') {
        win.webContents.toggleDevTools()
        event.preventDefault()
      }
    })
  }
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    logger.error(`Pets 页面加载失败: ${errorCode} ${errorDescription}`)
  })
  return win
}

export function buildBubbleWindow(): BrowserWindow {
  return createPetSurfaceWindow('bubble', {
    width: 280,
    height: 72,
    bottomMargin: 300,
    movable: false,
    hiddenInMissionControl: true,
    moveTop: false,
    forwardMouseEvents: false,
  })
}

export function buildBackgroundAudioWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1,
    height: 1,
    show: false,
    skipTaskbar: true,
    webPreferences: createRendererPreferences({
      webSecurity: false,
      backgroundThrottling: false,
      additionalArguments: ['--autoplay-policy=no-user-gesture-required'],
    }),
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL)
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/audio.html`)
  else
    win.loadFile(join(__dirname, '../renderer/audio.html'))

  const allowedPermissions = new Set(['media', 'microphone', 'audioCapture', 'mediaDevices'])
  win.webContents.session.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(allowedPermissions.has(permission))
  })

  if (is.dev)
    win.webContents.openDevTools({ mode: 'detach' })

  logger.info('后台音频窗口已创建')
  return win
}
