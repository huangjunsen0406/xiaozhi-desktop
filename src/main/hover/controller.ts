import type { BrowserWindow } from 'electron'
import type { HoverMode } from './position'
import { screen } from 'electron'
import { ensureMiniWindow } from '../windows/windowManager'
import { buildHoverWindow } from './HoverWindow'
import { computeHoverPosition } from './position'
import { HoverRelay } from './relay'

/** 悬浮窗实例 */
let hoverWin: BrowserWindow | null = null
/** 悬浮窗中继控制器，用于处理鼠标移入移出逻辑 */
const relay = new HoverRelay()

/**
 * 确保悬浮窗存在并返回实例
 * 如果悬浮窗不存在，则创建新的悬浮窗
 * @returns BrowserWindow 悬浮窗实例
 */
export function ensureHoverWindow(): BrowserWindow {
  if (!hoverWin) {
    hoverWin = buildHoverWindow()
    hoverWin.on('closed', () => {
      relay.stop()
      hoverWin = null
    })
  }
  return hoverWin
}

/**
 * 显示悬浮窗
 * 根据主窗口位置计算悬浮窗位置，并在屏幕上显示悬浮窗
 */
export function show(): void {
  const mini = ensureMiniWindow()
  const hover = ensureHoverWindow()
  const miniBounds = mini.getBounds()
  const work = screen.getDisplayMatching(miniBounds).workArea
  const [w, h] = hover.getSize()
  const pos = computeHoverPosition(miniBounds, { width: w, height: h }, work)
  hover.setPosition(pos.x, pos.y)
  hover.showInactive()
  hover.moveTop()
  try {
    hover.webContents.send('hover:orientation', { mode: pos.mode as HoverMode })
  }
  catch {}
}

/**
 * 隐藏悬浮窗
 * 停止中继控制器并隐藏悬浮窗
 */
export function hide(): void {
  if (!hoverWin)
    return
  relay.stop()
  hoverWin.hide()
}

/**
 * 重新定位悬浮窗
 * 当主窗口位置改变时，重新计算并设置悬浮窗位置
 * 仅在悬浮窗可见时执行
 */
export function reposition(): void {
  const mini = ensureMiniWindow()
  const hover = ensureHoverWindow()
  if (!hover.isVisible())
    return
  const miniBounds = mini.getBounds()
  const work = screen.getDisplayMatching(miniBounds).workArea
  const [w, h] = hover.getSize()
  const pos = computeHoverPosition(miniBounds, { width: w, height: h }, work)
  hover.setPosition(pos.x, pos.y)
  try {
    hover.webContents.send('hover:orientation', { mode: pos.mode as HoverMode })
  }
  catch {}
}

/**
 * 鼠标进入主窗口时的处理函数
 * 停止中继控制器并显示悬浮窗
 */
export function onMiniEnter(): void {
  relay.stop()
  show()
}

/**
 * 鼠标离开主窗口时的处理函数
 * 启动中继控制器监听鼠标移动，如果鼠标离开主窗口和悬浮窗区域则自动隐藏悬浮窗
 */
export function onMiniLeave(): void {
  const mini = ensureMiniWindow()
  const hover = ensureHoverWindow()
  if (!hover.isVisible())
    return
  relay.start(mini.getBounds(), hover.getBounds(), () => {}, () => hide())
}

/**
 * 鼠标进入悬浮窗时的处理函数
 * 停止中继控制器，保持悬浮窗显示
 */
export function onHoverEnter(): void {
  relay.stop()
}

/**
 * 鼠标离开悬浮窗时的处理函数
 * 启动中继控制器监听鼠标移动，如果鼠标离开主窗口和悬浮窗区域则自动隐藏悬浮窗
 */
export function onHoverLeave(): void {
  const mini = ensureMiniWindow()
  const hover = ensureHoverWindow()
  if (!hover.isVisible())
    return
  relay.start(mini.getBounds(), hover.getBounds(), () => {}, () => hide())
}
