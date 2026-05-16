import { join } from 'node:path'
import process from 'node:process'
import { is } from '@electron-toolkit/utils'
import { BrowserWindow, screen } from 'electron'
import { getAppIcon } from '../../utils/appIcon'
import { getLogger } from '../../utils/logger'
import { handleWindowClose } from '../windowManager'

const logger = getLogger('PetsWindow')

/**
 * 构建精灵宠物桌面窗口
 */
export function buildPetsWindow(): BrowserWindow {
  const windowSize = { width: 150, height: 170 }

  // 获取屏幕信息
  const display = screen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight } = display.workAreaSize

  // 默认位置：屏幕右下角
  const defaultX = screenWidth - windowSize.width - 50
  const defaultY = screenHeight - windowSize.height - 50

  const icon = getAppIcon()

  const win = new BrowserWindow({
    x: defaultX,
    y: defaultY,
    width: windowSize.width,
    height: windowSize.height,
    show: false, // 初始隐藏，等待用户切换到精灵宠物模式
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    fullscreenable: false,
    hiddenInMissionControl: false,
    type: process.platform === 'darwin' ? 'panel' : undefined,
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
      devTools: is.dev, // 仅在开发模式下启用开发者工具
    },
  })

  // 窗口准备好后的回调
  win.on('ready-to-show', () => {
    logger.info('Window ready to show')
  })

  // 处理窗口关闭事件
  win.on('close', (event) => {
    handleWindowClose(event, win)
  })

  // 设置窗口在所有工作区可见
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // 设置置顶层级
  win.setAlwaysOnTop(true, process.platform === 'darwin' ? 'floating' : 'normal')
  win.moveTop()

  // 开发模式不穿透（方便调试），生产模式穿透
  if (!is.dev) {
    win.setIgnoreMouseEvents(true, { forward: true })
  }

  // 开发模式下支持快捷键打开 DevTools
  if (is.dev) {
    win.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F12') {
        win.webContents.toggleDevTools()
        event.preventDefault()
      }
    })
  }

  // 加载完成后日志
  win.webContents.on('did-finish-load', () => {
    logger.info(`页面加载完成: ${win.webContents.getURL()}`)
  })

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    logger.error(`页面加载失败: ${errorCode} ${errorDescription}`)
  })

  // 加载页面
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/pets`)
  }
  else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'pets' })
  }

  return win
}
