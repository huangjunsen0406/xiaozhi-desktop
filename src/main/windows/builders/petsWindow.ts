import process from 'node:process'
import { is } from '@electron-toolkit/utils'
import { BrowserWindow, screen } from 'electron'
import { getAppIcon } from '../../utils/appIcon'
import { getLogger } from '../../utils/logger'
import { applyPetSurfaceWorkspaceAndTop } from '../petSurfaceLayering'
import { createRendererPreferences, loadRendererRoute } from '../rendererWindow'
import { handleWindowClose } from '../windowManager'

const logger = getLogger('PetsWindow')

/**
 * 构建精灵宠物桌面窗口
 * 层级对齐 Codex Pet Surface：panel + floating + skipTransformProcessType
 */
export function buildPetsWindow(): BrowserWindow {
  const windowSize = { width: 150, height: 180 }

  // 获取屏幕信息
  const display = screen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight } = display.workAreaSize

  // 默认位置：屏幕右下角
  const defaultX = screenWidth - windowSize.width - 50
  const defaultY = screenHeight - windowSize.height - 50

  const icon = getAppIcon()
  const isDarwin = process.platform === 'darwin'

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
    // Codex pet surface：不进任务栏
    skipTaskbar: true,
    fullscreenable: false,
    acceptFirstMouse: true,
    // 与 Codex 一致：surface 不抢焦点；拖动走 IPC
    focusable: false,
    hiddenInMissionControl: false,
    type: isDarwin ? 'panel' : undefined,
    ...(isDarwin ? { enableLargerThanScreen: true } : {}),
    ...(icon ? { icon } : {}),
    webPreferences: createRendererPreferences({ devTools: is.dev }),
  })

  // 窗口准备好后的回调
  win.on('ready-to-show', () => {
    logger.info('Window ready to show')
  })

  // 处理窗口关闭事件
  win.on('close', (event) => {
    handleWindowClose(event, win)
  })

  applyPetSurfaceWorkspaceAndTop(win)

  // 默认穿透；渲染进程在精灵内容上再关闭（与 live2d / Codex 一致）
  win.setIgnoreMouseEvents(true, { forward: true })

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
  loadRendererRoute(win, 'pets')

  return win
}
