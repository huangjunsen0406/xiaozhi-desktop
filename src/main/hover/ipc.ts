import type { HoverAnchor } from '@shared/types'
import { ipcMain } from 'electron'
import { hide, onHoverEnter, onHoverLeave, onMiniEnter, onMiniLeave, reposition, show, showForAnchor } from './controller'

function isHoverAnchor(v: unknown): v is HoverAnchor {
  return v === 'mini' || v === 'live2d' || v === 'pets'
}

/**
 * 每个 hover channel 只表达一个动作，避免聚合 action 协议。
 */
export function registerHoverIpc(): void {
  ipcMain.on('hover:show', show)
  ipcMain.on('hover:hide', hide)
  ipcMain.on('hover:reposition', reposition)
  ipcMain.on('hover:mini-enter', onMiniEnter)
  ipcMain.on('hover:mini-leave', onMiniLeave)
  ipcMain.on('hover:window-enter', onHoverEnter)
  ipcMain.on('hover:window-leave', onHoverLeave)
  ipcMain.on('hover:show-for', (_event, anchor: unknown, x: unknown, y: unknown) => {
    if (!isHoverAnchor(anchor)) {
      return
    }
    const hasPin = typeof x === 'number' && typeof y === 'number'
      && Number.isFinite(x) && Number.isFinite(y)
    showForAnchor(anchor, hasPin ? { x, y } : null)
  })
}
