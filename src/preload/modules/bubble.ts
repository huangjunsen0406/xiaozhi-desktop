/**
 * 气泡窗口 API（桌宠/Live2D 上方对话气泡）
 * Renderer 只通过 window.api 调用气泡能力
 */
import type { PetSurfaceContentSize, PetSurfaceId } from '@shared/types'
import { ipcRenderer } from 'electron'

export const bubbleApi = {
  /** 显示气泡窗（贴当前宠物/模型窗） */
  show: (): void => {
    ipcRenderer.send('bubble:show')
  },

  /** 隐藏气泡窗 */
  hide: (): void => {
    ipcRenderer.send('bubble:hide')
  },

  /**
   * Live2D 上报模型头顶相对窗口顶的偏移（主进程定位气泡用）
   */
  setAnchorOffset: (offsetY: number): void => {
    if (typeof offsetY !== 'number' || !Number.isFinite(offsetY))
      return
    ipcRenderer.send('bubble:set-anchor-offset', offsetY)
  },

  /**
   * 桌宠壳：上报 surface 可见内容尺寸，主进程 setBounds 紧包内容。
   * surface = pets | live2d | bubble
   */
  setContentSize: (surface: PetSurfaceId, size: PetSurfaceContentSize): void => {
    if (surface !== 'pets' && surface !== 'live2d' && surface !== 'bubble')
      return
    if (size == null || typeof size !== 'object')
      return
    if (typeof size.width !== 'number' || typeof size.height !== 'number')
      return
    if (!Number.isFinite(size.width) || !Number.isFinite(size.height))
      return
    if (size.width <= 0 || size.height <= 0)
      return
    const payload: PetSurfaceContentSize = {
      width: size.width,
      height: size.height,
    }
    if (typeof size.anchorOffsetY === 'number' && Number.isFinite(size.anchorOffsetY))
      payload.anchorOffsetY = size.anchorOffsetY
    ipcRenderer.send('pet-shell:set-content-size', surface, payload)
  },

  /**
   * 监听主进程下发的箭头水平位置（气泡内坐标）
   * @returns 取消订阅
   */
  onSetArrowX: (callback: (x: number) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, x: number): void => {
      if (typeof x === 'number' && Number.isFinite(x))
        callback(x)
    }
    ipcRenderer.on('bubble:set-arrow-x', handler)
    return () => ipcRenderer.off('bubble:set-arrow-x', handler)
  },
}
