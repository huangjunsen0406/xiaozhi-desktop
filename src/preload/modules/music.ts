/**
 * 音乐播放 API 模块
 */
import { ipcRenderer } from 'electron'

export const musicApi = {
  /**
   * 监听主进程发送的音乐指令
   */
  onCommand: (callback: (message: { command: string, args?: Record<string, unknown> }) => void): void => {
    ipcRenderer.on('music:command', (_event, message) => {
      callback(message)
    })
  },

  /**
   * 向主进程发送状态更新
   */
  statusUpdate: (status: Record<string, unknown>): void => {
    ipcRenderer.send('music:status-update', status)
  },
}
