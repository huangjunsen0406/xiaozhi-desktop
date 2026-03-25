import type { BackgroundAudioStateUpdate, BackgroundAudioStatus } from '@shared/types'
/**
 * 后台音频窗口 API 模块
 */
import { ipcRenderer } from 'electron'

export type { BackgroundAudioStateUpdate, BackgroundAudioStatus }

export const backgroundAudioApi = {
  // 监听音频命令
  onAudioCommand: (callback: (command: string, data?: unknown) => void): () => void => {
    const handler = (_: Electron.IpcRendererEvent, command: string, data?: unknown) => callback(command, data)
    ipcRenderer.on('audio:command', handler)
    return () => ipcRenderer.off('audio:command', handler)
  },

  // 发送音频状态（旧版兼容）
  sendAudioState: (state: BackgroundAudioStateUpdate): void => ipcRenderer.send('audio:state', state),

  // 更新音频状态（新版）
  audioUpdateState: (state: BackgroundAudioStateUpdate): void => ipcRenderer.send('audio:state', state),

  // 获取后台音频状态（仅主窗口可用）
  getStatus: (): Promise<BackgroundAudioStatus> => ipcRenderer.invoke('background-audio:get-status'),
}
