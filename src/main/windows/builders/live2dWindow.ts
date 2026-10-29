import process from 'node:process'
import { is } from '@electron-toolkit/utils'
import { BrowserWindow, screen } from 'electron'
import { getAppIcon } from '../../utils/appIcon'
import { getLogger } from '../../utils/logger'
import { applyPetSurfaceWorkspaceAndTop } from '../petSurfaceLayering'
import { createRendererPreferences, loadRendererRoute } from '../rendererWindow'
import { handleWindowClose } from '../windowManager'

const logger = getLogger('Live2dWindow')
// import { initLive2dDragBehavior } from '../behaviors/Live2dDragBehavior'

/**
 * 构建 Live2D 桌面宠物窗口
 * 层级对齐 Codex Pet Surface：panel + floating + skipTransformProcessType
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
  const isDarwin = process.platform === 'darwin'

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
    // Codex pet surface：不进任务栏；主窗/dock 由其它窗口承担
    skipTaskbar: true,
    fullscreenable: false,
    // 首击即可交互（macOS 常需先 focus 再 click 的问题）
    acceptFirstMouse: true,
    // 与 Codex 一致：surface 不抢焦点；拖动走 IPC，不依赖窗口 focus
    focusable: false,
    hiddenInMissionControl: false,
    type: isDarwin ? 'panel' : undefined,
    // Codex：允许在全屏应用边缘外布局时略超出屏
    ...(isDarwin ? { enableLargerThanScreen: true } : {}),
    ...(icon ? { icon } : {}),
    webPreferences: createRendererPreferences({ devTools: is.dev }),
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

  applyPetSurfaceWorkspaceAndTop(win)

  // 默认忽略鼠标事件（穿透）
  win.setIgnoreMouseEvents(true, { forward: true })

  // 暂时不使用全局拖动(uiohook 会冲突)
  // 后续可以通过检测模型边界来实现拖动
  // initLive2dDragBehavior(win)

  // 加载页面
  loadRendererRoute(win, 'live2d')

  return win
}
