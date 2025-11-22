/**
 * Camera API - 摄像头相关功能
 */
import { ipcRenderer } from 'electron'

export const cameraApi = {
  /**
   * 监听捕获请求
   */
  onCaptureRequest(callback: () => void): () => void {
    ipcRenderer.on('camera:request-capture', callback)
    return () => ipcRenderer.removeListener('camera:request-capture', callback)
  },

  /**
   * 发送捕获结果
   */
  sendCaptureResult(success: boolean, data?: Uint8Array, message?: string): void {
    ipcRenderer.send('camera:capture-result', { success, data, message })
  },
}
