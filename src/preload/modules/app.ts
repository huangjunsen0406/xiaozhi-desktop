import type { AppStateSnapshotRaw, IpcResult, ServerMessage } from '@shared/types'
/**
 * Application 控制 API 模块
 */
import { ipcRenderer } from 'electron'

// 导出类型以便其他模块使用
export type { ServerMessage }
export type AppStateSnapshot = AppStateSnapshotRaw

export const appApi = {
  // 开始手动监听
  startListeningManual: async (): Promise<void> => {
    const result = await ipcRenderer.invoke('app:start-listening-manual') as IpcResult<void>
    if (!result.success) {
      throw new Error(result.error || '开始手动监听失败')
    }
  },

  // 停止手动监听
  stopListeningManual: async (): Promise<void> => {
    const result = await ipcRenderer.invoke('app:stop-listening-manual') as IpcResult<void>
    if (!result.success) {
      throw new Error(result.error || '停止手动监听失败')
    }
  },

  // 开始自动对话
  startAutoConversation: async (): Promise<void> => {
    const result = await ipcRenderer.invoke('app:start-auto-conversation') as IpcResult<void>
    if (!result.success) {
      throw new Error(result.error || '开始自动对话失败')
    }
  },

  // 停止自动对话
  stopAutoConversation: async (): Promise<void> => {
    const result = await ipcRenderer.invoke('app:stop-auto-conversation') as IpcResult<void>
    if (!result.success) {
      throw new Error(result.error || '停止自动对话失败')
    }
  },

  // 发送文本消息
  sendText: async (text: string): Promise<void> => {
    const result = await ipcRenderer.invoke('app:send-text', text) as IpcResult<void>
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

  // 监听服务器消息（用于接收表情、文本等数据）
  onServerMessage: (callback: (message: ServerMessage) => void): void => {
    ipcRenderer.on('server:message', (_, message) => callback(message))
  },

  // 移除服务器消息监听器
  removeServerMessageListener: (): void => {
    ipcRenderer.removeAllListeners('server:message')
  },
}
