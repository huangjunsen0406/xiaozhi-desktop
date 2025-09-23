import { ipcMain } from 'electron'
import { hide, onHoverEnter, onHoverLeave, onMiniEnter, onMiniLeave, reposition, show } from './controller'

type HoverAction
  = | { type: 'show' }
    | { type: 'hide' }
    | { type: 'reposition' }
    | { type: 'mini-enter' }
    | { type: 'mini-leave' }
    | { type: 'hover-enter' }
    | { type: 'hover-leave' }

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
      default:
        break
    }
  })
}
