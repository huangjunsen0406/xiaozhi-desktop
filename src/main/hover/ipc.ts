import type { HoverAnchor } from './controller'
import { ipcMain } from 'electron'
import { hide, onHoverEnter, onHoverLeave, onMiniEnter, onMiniLeave, reposition, show, showForAnchor } from './controller'

/**
 * Hover 操作类型
 */
type HoverAction
  = | { type: 'show' }
    | { type: 'hide' }
    | { type: 'reposition' }
    | { type: 'mini-enter' }
    | { type: 'mini-leave' }
    | { type: 'hover-enter' }
    | { type: 'hover-leave' }
    | {
      type: 'show-for'
      anchor: HoverAnchor
      /** 屏幕坐标；右键菜单建议传入 */
      x?: number
      y?: number
    }

function isHoverAnchor(v: unknown): v is HoverAnchor {
  return v === 'mini' || v === 'live2d' || v === 'pets'
}

/**
 * 注册 hover:action IPC
 */
export function registerHoverIpc(): void {
  ipcMain.on('hover:action', (_e, action: HoverAction) => {
    switch (action?.type) {
      case 'show':
        show()
        break
      case 'hide':
        hide()
        break
      case 'reposition':
        reposition()
        break
      case 'mini-enter':
        onMiniEnter()
        break
      case 'mini-leave':
        onMiniLeave()
        break
      case 'hover-enter':
        onHoverEnter()
        break
      case 'hover-leave':
        onHoverLeave()
        break
      case 'show-for': {
        if (!isHoverAnchor(action.anchor))
          break
        const hasPin = typeof action.x === 'number' && typeof action.y === 'number'
          && Number.isFinite(action.x) && Number.isFinite(action.y)
        showForAnchor(
          action.anchor,
          hasPin ? { x: action.x!, y: action.y! } : null,
        )
        break
      }
    }
  })
}
