/**
 * 音乐播放 API 模块
 */
import { ipcRenderer } from 'electron'

export const musicApi = {
  /**
   * 监听主进程发送的音乐指令
   */
  onCommand: (callback: (message: { command: string, args?: Record<string, unknown> }) => void): () => void => {
    const handler = (_event: Electron.IpcRendererEvent, message: { command: string, args?: Record<string, unknown> }) => {
      callback(message)
    }
    try {
      ipcRenderer.on('music:command', handler)
    }
    catch (error) {
      console.error('[musicApi] register command listener failed', error)
    }
    return () => {
      try {
        ipcRenderer.off('music:command', handler)
      }
      catch (error) {
        console.error('[musicApi] remove command listener failed', error)
      }
    }
  },

  /**
   * 向主进程发送状态更新
   */
  statusUpdate: (status: Record<string, unknown>): void => {
    ipcRenderer.send('music:status-update', status)
  },
}
