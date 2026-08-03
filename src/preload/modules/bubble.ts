/**
 * 气泡窗口 API（桌宠/Live2D 上方对话气泡）
 * Renderer 只通过 window.api 调用气泡能力
 */
import type {
  BubbleLocalShowPayload,
  PetSurfaceContentSize,
  PetSurfaceId,
} from '@shared/types'
import { ipcRenderer } from 'electron'

function parseLocalShowPayload(raw: unknown): BubbleLocalShowPayload | null {
  if (raw == null || typeof raw !== 'object')
    return null
  const obj = raw as Record<string, unknown>
  if (typeof obj.text !== 'string' || obj.text.length === 0)
    return null
  if (obj.source !== 'reminder')
    return null
  const payload: BubbleLocalShowPayload = {
    text: obj.text,
    source: 'reminder',
  }
  if (typeof obj.durationMs === 'number' && Number.isFinite(obj.durationMs) && obj.durationMs > 0)
    payload.durationMs = obj.durationMs
  return payload
}

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

  /**
   * 本地关怀提醒等非会话气泡（不写聊天、不要求 deviceState）
   * @returns 取消订阅
   */
  onShowLocal: (callback: (payload: BubbleLocalShowPayload) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, raw: unknown): void => {
      const payload = parseLocalShowPayload(raw)
      if (payload)
        callback(payload)
    }
    ipcRenderer.on('bubble:show-local', handler)
    return () => ipcRenderer.off('bubble:show-local', handler)
  },

  /**
   * 主进程可选：强制结束本地气泡
   * @returns 取消订阅
   */
  onHideLocal: (callback: () => void): (() => void) => {
    const handler = (): void => {
      callback()
    }
    ipcRenderer.on('bubble:hide-local', handler)
    return () => ipcRenderer.off('bubble:hide-local', handler)
  },
}
