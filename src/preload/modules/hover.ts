/**
 * Hover 控制 API 模块
 */
import type { HoverAnchor } from '@shared/types'
import { ipcRenderer } from 'electron'

export const hoverApi = {
  showHover: (): void => ipcRenderer.send('hover:show'),
  hideHover: (): void => ipcRenderer.send('hover:hide'),
  repositionHover: (): void => ipcRenderer.send('hover:reposition'),

  /**
   * 按锚点显示独立 Hover 菜单窗（Live2D/Pets 右键用）
   * @param anchor 菜单的锚点窗口
   * @param screenX 屏幕 X（建议 clientX + screenX 换算后的绝对坐标）
   * @param screenY 屏幕 Y
   */
  showHoverFor: (anchor: HoverAnchor, screenX?: number, screenY?: number): void =>
    ipcRenderer.send('hover:show-for', anchor, screenX, screenY),

  hoverMiniEnter: (): void => ipcRenderer.send('hover:mini-enter'),
  hoverMiniLeave: (): void => ipcRenderer.send('hover:mini-leave'),
  hoverWindowEnter: (): void => ipcRenderer.send('hover:window-enter'),
  hoverWindowLeave: (): void => ipcRenderer.send('hover:window-leave'),
}
