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
  startListeningManual: async (): Promise<void> => {
    const result: any = await ipcRenderer.invoke('app:start-listening-manual')
    if (!result.success) {
      throw new Error(result.error || '开始手动监听失败')
    }
  },

  // 停止手动监听
  stopListeningManual: async (): Promise<void> => {
    const result: any = await ipcRenderer.invoke('app:stop-listening-manual')
    if (!result.success) {
      throw new Error(result.error || '停止手动监听失败')
    }
  },

  // 开始自动对话
  startAutoConversation: async (): Promise<void> => {
    const result: any = await ipcRenderer.invoke('app:start-auto-conversation')
    if (!result.success) {
      throw new Error(result.error || '开始自动对话失败')
    }
  },

  // 停止自动对话
  stopAutoConversation: async (): Promise<void> => {
    const result: any = await ipcRenderer.invoke('app:stop-auto-conversation')
    if (!result.success) {
      throw new Error(result.error || '停止自动对话失败')
    }
  },

  // 发送文本消息
  sendText: async (text: string): Promise<void> => {
    const result: any = await ipcRenderer.invoke('app:send-text', text)
    if (!result.success) {
      throw new Error(result.error || '发送文本消息失败')
    }
  },

  // 获取状态快照
  getState: (): Promise<AppStateSnapshot> => ipcRenderer.invoke('app:get-state'),

  // 监听状态变化
  onStateChanged: (callback: (state: AppStateSnapshot) => void): void => {
    ipcRenderer.on('app:state-changed', (_, state) => callback(state))
  },

  // 移除状态变化监听器
  removeStateChangedListener: (): void => {
    ipcRenderer.removeAllListeners('app:state-changed')
  },
}
