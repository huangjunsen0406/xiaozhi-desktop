/**
 * 气泡窗口 API（桌宠/Live2D 上方对话气泡）
 * Renderer 禁止直接 window.electron.ipcRenderer 打 bubble:* channel
 */
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
