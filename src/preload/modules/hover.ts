/**
 * Hover 控制 API 模块
 */
import { ipcRenderer } from 'electron'

export type HoverMenuAnchor = 'mini' | 'live2d' | 'pets'

export const hoverApi = {
  showHover: (): void => ipcRenderer.send('hover:action', { type: 'show' }),
  hideHover: (): void => ipcRenderer.send('hover:action', { type: 'hide' }),
  repositionHover: (): void => ipcRenderer.send('hover:action', { type: 'reposition' }),

  /**
   * 按锚点显示独立 Hover 菜单窗（Live2D/Pets 右键用）
   * @param screenX 屏幕 X（建议 clientX + screenX 换算后的绝对坐标）
   * @param screenY 屏幕 Y
   */
  showHoverFor: (anchor: HoverMenuAnchor, screenX?: number, screenY?: number): void => {
    ipcRenderer.send('hover:action', {
      type: 'show-for',
      anchor,
      x: screenX,
      y: screenY,
    })
  },

  hoverMiniEnter: (): void => ipcRenderer.send('hover:action', { type: 'mini-enter' }),
  hoverMiniLeave: (): void => ipcRenderer.send('hover:action', { type: 'mini-leave' }),
  hoverWindowEnter: (): void => ipcRenderer.send('hover:action', { type: 'hover-enter' }),
  hoverWindowLeave: (): void => ipcRenderer.send('hover:action', { type: 'hover-leave' }),
}
