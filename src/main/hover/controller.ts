import type { BrowserWindow, Rectangle } from 'electron'
import type { HoverMode } from './position'
import { screen } from 'electron'
import { ensureMiniWindow, getLive2dWindow, getPetsWindow } from '../windows/windowManager'
import { buildHoverWindow } from './HoverWindow'
import { computeHoverPosition } from './position'
import { HoverRelay } from './relay'

/** 悬浮菜单锚点：mini 悬停 / live2d·pets 右键 */
export type HoverAnchor = 'mini' | 'live2d' | 'pets'

/** 悬浮窗实例 */
let hoverWin: BrowserWindow | null = null
/** 当前锚点模式（决定定位与 relay 参照窗） */
let currentAnchor: HoverAnchor = 'mini'
/** 悬浮窗中继控制器 */
const relay = new HoverRelay()

function getAnchorWindow(anchor: HoverAnchor): BrowserWindow | null {
  if (anchor === 'mini')
    return ensureMiniWindow()
  if (anchor === 'live2d')
    return getLive2dWindow()
  return getPetsWindow()
}

/**
 * 确保悬浮窗存在并返回实例
 */
export function ensureHoverWindow(): BrowserWindow {
  if (!hoverWin) {
    hoverWin = buildHoverWindow()
    hoverWin.on('closed', () => {
      relay.stop()
      hoverWin = null
      currentAnchor = 'mini'
    })
  }
  return hoverWin
}

/**
 * 相对锚点窗口定位菜单（与 Mini 同一套四向 + 垂直/水平居中算法）
 * 右键不再跟光标走，避免菜单贴在模型/精灵身上或落在半截位置
 */
function placeHover(anchorBounds: Rectangle): HoverMode {
  const hover = ensureHoverWindow()
  const work = screen.getDisplayMatching(anchorBounds).workArea
  const [w, h] = hover.getSize()
  const pos = computeHoverPosition(anchorBounds, { width: w, height: h }, work)
  hover.setPosition(Math.round(pos.x), Math.round(pos.y))
  try {
    hover.webContents.send('hover:orientation', { mode: pos.mode })
  }
  catch {}
  return pos.mode
}

/**
 * 显示悬浮窗（默认贴 mini，与历史行为一致）
 */
export function show(): void {
  currentAnchor = 'mini'
  const mini = ensureMiniWindow()
  const hover = ensureHoverWindow()
  placeHover(mini.getBounds())
  hover.showInactive()
  hover.moveTop()
}

/**
 * 按锚点窗口显示悬浮菜单（与 Mini 相同：贴窗四向 + 居中）
 * screenPoint 参数保留兼容，定位不再使用光标坐标
 */
export function showForAnchor(
  anchor: HoverAnchor,
  _screenPoint?: { x: number, y: number } | null,
): void {
  const anchorWin = getAnchorWindow(anchor)
  if (!anchorWin || anchorWin.isDestroyed()) {
    show()
    return
  }

  currentAnchor = anchor
  const hover = ensureHoverWindow()
  placeHover(anchorWin.getBounds())
  hover.showInactive()
  hover.moveTop()
}

/**
 * 隐藏悬浮窗
 */
export function hide(): void {
  if (!hoverWin)
    return
  relay.stop()
  hoverWin.hide()
  currentAnchor = 'mini'
}

/**
 * 重新定位（仅 visible 时；跟随当前锚点窗）
 */
export function reposition(): void {
  const hover = ensureHoverWindow()
  if (!hover.isVisible())
    return

  const anchorWin = getAnchorWindow(currentAnchor)
  if (!anchorWin || anchorWin.isDestroyed()) {
    hide()
    return
  }
  placeHover(anchorWin.getBounds())
}

export function onMiniEnter(): void {
  relay.stop()
  showForAnchor('mini')
}

export function onMiniLeave(): void {
  const mini = ensureMiniWindow()
  const hover = ensureHoverWindow()
  if (!hover.isVisible())
    return
  // 仅 mini 悬停模式用 ball↔menu relay；右键 pin 不靠 mini leave
  if (currentAnchor !== 'mini')
    return
  relay.start(mini.getBounds(), hover.getBounds(), () => {}, () => hide())
}

export function onHoverEnter(): void {
  relay.stop()
}

export function onHoverLeave(): void {
  const hover = ensureHoverWindow()
  if (!hover.isVisible())
    return

  if (currentAnchor === 'mini') {
    const mini = ensureMiniWindow()
    relay.start(mini.getBounds(), hover.getBounds(), () => {}, () => hide())
    return
  }

  // live2d/pets 右键菜单：离开菜单后短延迟隐藏（仍可用点击项）
  const anchorWin = getAnchorWindow(currentAnchor)
  if (!anchorWin || anchorWin.isDestroyed()) {
    hide()
    return
  }
  relay.start(anchorWin.getBounds(), hover.getBounds(), () => {}, () => hide())
}
