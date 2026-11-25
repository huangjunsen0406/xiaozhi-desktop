import type { HoverAnchor } from '@shared/types'
import { ipcMain } from 'electron'
import { hide, onHoverEnter, onHoverLeave, onMiniEnter, onMiniLeave, reposition, show, showForAnchor } from './controller'

function isHoverAnchor(v: unknown): v is HoverAnchor {
  return v === 'mini' || v === 'live2d' || v === 'pets'
}

export function registerHoverIpc(): void {
  ipcMain.on('hover:show', show)
  ipcMain.on('hover:hide', hide)
  ipcMain.on('hover:reposition', reposition)
  ipcMain.on('hover:mini-enter', onMiniEnter)
  ipcMain.on('hover:mini-leave', onMiniLeave)
  ipcMain.on('hover:window-enter', onHoverEnter)
  ipcMain.on('hover:window-leave', onHoverLeave)
  ipcMain.on('hover:show-for', (_event, anchor: unknown) => {
    if (isHoverAnchor(anchor))
      showForAnchor(anchor)
  })
}
