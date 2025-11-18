/**
 * 后台音频窗口 API 模块
 */
import { ipcRenderer } from 'electron'

/**
 * 音频状态类型
 */
export interface AudioState {
  capturing: boolean
  playing: boolean
  error?: string
}

export const backgroundAudioApi = {
  // 监听音频命令
  onAudioCommand: (callback: (command: string, data?: unknown) => void): void => {
    ipcRenderer.on('audio:command', (_, command, data) => callback(command, data))
  },

  // 发送音频状态
  sendAudioState: (state: AudioState): void => ipcRenderer.send('audio:state', state),
}
