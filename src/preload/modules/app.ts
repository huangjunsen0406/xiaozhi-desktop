/**
 * Application 控制 API 模块
 */
import { ipcRenderer } from 'electron'

/**
 * 应用状态快照类型
 */
export interface AppStateSnapshot {
  device_state: string
  listening_mode: string
  keep_listening: boolean
  audio_opened: boolean
}

export const appApi = {
  // 开始手动监听
  startListeningManual: (): Promise<void> => ipcRenderer.invoke('app:start-listening-manual'),

  // 停止手动监听
  stopListeningManual: (): Promise<void> => ipcRenderer.invoke('app:stop-listening-manual'),

  // 开始自动对话
  startAutoConversation: (): Promise<void> => ipcRenderer.invoke('app:start-auto-conversation'),

  // 停止自动对话
  stopAutoConversation: (): Promise<void> => ipcRenderer.invoke('app:stop-auto-conversation'),

  // 发送文本消息
  sendText: (text: string): Promise<void> => ipcRenderer.invoke('app:send-text', text),

  // 获取状态快照
  getState: (): Promise<AppStateSnapshot> => ipcRenderer.invoke('app:get-state'),

  // 监听状态变化
  onStateChanged: (callback: (state: AppStateSnapshot) => void): void => {
    ipcRenderer.on('app:state-changed', (_, state) => callback(state))
  },
}
