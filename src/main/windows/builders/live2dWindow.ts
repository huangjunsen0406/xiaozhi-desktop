import { join } from 'node:path'
import process from 'node:process'
import { is } from '@electron-toolkit/utils'
import { BrowserWindow, nativeImage, screen } from 'electron'

import { getLogger } from '../../utils/logger'
import { handleWindowClose } from '../windowManager'

const logger = getLogger('Live2dWindow')

function getAppIcon() {
  if (process.platform === 'win32') {
    // Windows: 使用 icon.ico
    return join(__dirname, '../../resources/icon.ico')
  }
  else if (process.platform === 'linux') {
    // Linux: 使用 icon.png
    return nativeImage.createFromPath(join(__dirname, '../../resources/icon.png'))
  }
  return undefined
}
// import { initLive2dDragBehavior } from '../behaviors/Live2dDragBehavior'

/**
 * 构建 Live2D 桌面宠物窗口
 */
export function buildLive2dWindow(): BrowserWindow {
  // 读取窗口位置配置（如果有的话）
  const windowSize = { width: 200, height: 400 }

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
    width: 200,
    height: 400,
    show: false, // 初始隐藏，等待用户切换到 Live2D 模式
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
    // 不自动显示，等待用户切换到 Live2D 模式
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

  // 默认忽略鼠标事件（穿透）
  win.setIgnoreMouseEvents(true, { forward: true })

  // 暂时不使用全局拖动(uiohook 会冲突)
  // 后续可以通过检测模型边界来实现拖动
  // initLive2dDragBehavior(win)

  // 加载页面
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/live2d`)
  }
  else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'live2d' })
  }

  return win
}
