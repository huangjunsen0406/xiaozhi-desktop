import type { BackgroundAudioStateUpdate, BackgroundAudioStatus } from '@shared/types'
import { ipcRenderer } from 'electron'
import { invokeData, subscribeChannel } from '../utils/ipc'

export const backgroundAudioApi = {
  onAudioCommand: (callback: (command: string, data?: Record<string, unknown>) => void): () => void =>
    subscribeChannel('audio:command', callback),

  sendAudioState: (state: BackgroundAudioStateUpdate): void => ipcRenderer.send('audio:state', state),

  getStatus: (): Promise<BackgroundAudioStatus> =>
    invokeData('background-audio:get-status', '获取后台音频状态失败'),
}
