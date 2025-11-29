import { ipcMain } from 'electron'
import { hide, onHoverEnter, onHoverLeave, onMiniEnter, onMiniLeave, reposition, show } from './controller'

/**
 * 悬浮窗操作类型定义
 * 支持的操作包括：显示、隐藏、重定位、鼠标进入/离开事件
 */
type HoverAction
  = | { type: 'show' } // 显示悬浮窗
    | { type: 'hide' } // 隐藏悬浮窗
    | { type: 'reposition' } // 重新定位悬浮窗
    | { type: 'mini-enter' } // 鼠标进入主窗口
    | { type: 'mini-leave' } // 鼠标离开主窗口
    | { type: 'hover-enter' } // 鼠标进入悬浮窗
    | { type: 'hover-leave' } // 鼠标离开悬浮窗

/**
 * 注册悬浮窗 IPC 通信处理器
 * 监听 'hover:action' 事件，根据不同的操作类型执行相应的控制函数
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
      default:
        break
    }
  })
}
