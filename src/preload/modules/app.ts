import type { AppStateSnapshot, ServerMessage } from '@shared/types'
/**
 * Application 控制 API 模块
 */
import { ipcRenderer } from 'electron'
import { unwrapIpcResult } from '../utils/ipc'

// 导出类型以便其他模块使用
export type { AppStateSnapshot, ServerMessage }

export const appApi = {
  // 开始手动监听
  startListeningManual: async (): Promise<void> => {
    const result: unknown = await ipcRenderer.invoke('app:start-listening-manual')
    unwrapIpcResult(result, '开始手动监听失败')
  },

  // 停止手动监听
  stopListeningManual: async (): Promise<void> => {
    const result: unknown = await ipcRenderer.invoke('app:stop-listening-manual')
    unwrapIpcResult(result, '停止手动监听失败')
  },

  // 开始自动对话
  startAutoConversation: async (): Promise<void> => {
    const result: unknown = await ipcRenderer.invoke('app:start-auto-conversation')
    unwrapIpcResult(result, '开始自动对话失败')
  },

  // 停止自动对话
  stopAutoConversation: async (): Promise<void> => {
    const result: unknown = await ipcRenderer.invoke('app:stop-auto-conversation')
    unwrapIpcResult(result, '停止自动对话失败')
  },

  // 发送文本消息（用户话语，会话语义）
  sendText: async (text: string): Promise<void> => {
    const result: unknown = await ipcRenderer.invoke('app:send-text', text)
    unwrapIpcResult(result, '发送文本消息失败')
  },

  // 获取状态快照
  getState: (): Promise<AppStateSnapshot> => ipcRenderer.invoke('app:get-state'),

  // 监听状态变化
  onStateChanged: (callback: (state: AppStateSnapshot) => void): () => void => {
    const handler = (_: Electron.IpcRendererEvent, state: AppStateSnapshot) => callback(state)
    ipcRenderer.on('app:state-changed', handler)
    return () => {
      ipcRenderer.off('app:state-changed', handler)
    }
  },

  // 监听服务器消息（用于接收表情、文本等数据）
  onServerMessage: (callback: (message: ServerMessage) => void): () => void => {
    const handler = (_: Electron.IpcRendererEvent, message: ServerMessage) => callback(message)
    ipcRenderer.on('server:message', handler)
    return () => ipcRenderer.off('server:message', handler)
  },
}
