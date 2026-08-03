import { join } from 'node:path'
import process from 'node:process'
import { is } from '@electron-toolkit/utils'
import { BrowserWindow, screen } from 'electron'
import { getLogger } from '../../utils/logger'
import { applyPetSurfaceWorkspaceAndTop } from '../petSurfaceLayering'
import { handleWindowClose } from '../windowManager'

const logger = getLogger('BubbleWindow')

/**
 * 构建气泡独立窗口
 * 透明、无边框、置顶、点击穿透，跟随精灵/Live2D 窗口定位
 * 层级与 pets/live2d 同套 Codex Pet Surface 策略
 */
export function buildBubbleWindow(): BrowserWindow {
  // 初始占位仅用于未 measure 前；有文案后按文案固有宽高缩窗（与宠物窗宽无关）
  const windowSize = { width: 280, height: 72 }

  // 获取屏幕信息，默认位置在屏幕右下角上方
  const display = screen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight } = display.workAreaSize

  const defaultX = screenWidth - windowSize.width - 50
  const defaultY = screenHeight - windowSize.height - 300

  const isDarwin = process.platform === 'darwin'

  const win = new BrowserWindow({
    x: defaultX,
    y: defaultY,
    width: windowSize.width,
    height: windowSize.height,
    show: false, // 初始隐藏，有内容时显示
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    acceptFirstMouse: true,
    // 展示向气泡：不抢焦点
    focusable: false,
    hiddenInMissionControl: true,
    type: isDarwin ? 'panel' : undefined,
    ...(isDarwin ? { enableLargerThanScreen: true } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
      devTools: is.dev,
    },
  })

  // 窗口准备好后的回调
  win.on('ready-to-show', () => {
    logger.info('气泡窗口已就绪')
  })

  // 处理窗口关闭事件
  win.on('close', (event) => {
    handleWindowClose(event, win)
  })

  applyPetSurfaceWorkspaceAndTop(win, { moveTop: false })

  // 始终点击穿透
  win.setIgnoreMouseEvents(true, { forward: false })

  // 加载页面
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/bubble`)
  }
  else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'bubble' })
  }

  return win
}
