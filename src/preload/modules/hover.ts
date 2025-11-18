/**
 * Hover 控制 API 模块
 */
import { ipcRenderer } from 'electron'

export const hoverApi = {
  // Hover 窗口控制（通过单一 action 通道）
  showHover: (): void => ipcRenderer.send('hover:action', { type: 'show' }),
  hideHover: (): void => ipcRenderer.send('hover:action', { type: 'hide' }),
  repositionHover: (): void => ipcRenderer.send('hover:action', { type: 'reposition' }),

  // 跨窗口 Hover 交接
  hoverMiniEnter: (): void => ipcRenderer.send('hover:action', { type: 'mini-enter' }),
  hoverMiniLeave: (): void => ipcRenderer.send('hover:action', { type: 'mini-leave' }),
  hoverWindowEnter: (): void => ipcRenderer.send('hover:action', { type: 'hover-enter' }),
  hoverWindowLeave: (): void => ipcRenderer.send('hover:action', { type: 'hover-leave' }),
}
