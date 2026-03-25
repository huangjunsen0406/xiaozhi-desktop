/**
 * Live2D API
 * 提供 Live2D 相关功能
 */
import { ipcRenderer } from 'electron'

export const live2dApi = {
  /**
   * 监听音频音量数据（用于口型同步）
   * @param callback 回调函数，接收音量值 (0-1)
   */
  onAudioVolume: (callback: (volume: number) => void): () => void => {
    const handler = (_event: Electron.IpcRendererEvent, volume: number) => {
      callback(volume)
    }
    ipcRenderer.on('live2d:audio-volume', handler)
    return () => ipcRenderer.off('live2d:audio-volume', handler)
  },
}
