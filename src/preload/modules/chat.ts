import type {
  AddMessageParams,
  ChatMessage,
  ChatMessageAddedEvent,
  ChatMessagesBatchAddedEvent,
  ChatSession,
  ChatSessionCreatedEvent,
  CreateSessionParams,
  ImageCapturedEvent,
} from '@shared/types'
/**
 * 聊天 API 模块
 */
import { ipcRenderer } from 'electron'
import { unwrapIpcResult } from '../utils/ipc'

export const chatApi = {
  /**
   * 获取会话列表
   */
  getSessions: async (limit = 50, offset = 0): Promise<ChatSession[]> => {
    const result: unknown = await ipcRenderer.invoke('chat:get-sessions', limit, offset)
    const data = unwrapIpcResult<ChatSession[] | undefined>(result, '获取会话列表失败')
    return data ?? []
  },

  /**
   * 获取单个会话
   */
  getSession: async (sessionId: string): Promise<ChatSession | null> => {
    const result: unknown = await ipcRenderer.invoke('chat:get-session', sessionId)
    const data = unwrapIpcResult<ChatSession | undefined>(result, '获取会话失败')
    return data ?? null
  },

  /**
   * 创建会话
   */
  createSession: async (data: CreateSessionParams): Promise<ChatSession> => {
    const result: unknown = await ipcRenderer.invoke('chat:create-session', data)
    return unwrapIpcResult(result, '创建会话失败')
  },

  /**
   * 获取消息列表
   * @param sessionId 会话ID
   * @param limit 限制数量，不传或传0则加载所有消息
   * @param offset 偏移量
   */
  getMessages: async (sessionId: string, limit?: number, offset = 0): Promise<ChatMessage[]> => {
    const result: unknown = await ipcRenderer.invoke('chat:get-messages', sessionId, limit, offset)
    // 将 IPC 传输后的图片数据转换回 Uint8Array
    const data = unwrapIpcResult<ChatMessage[] | undefined>(result, '获取消息失败')
    const messages = (data ?? []).map((msg: ChatMessage) => {
      if (msg.image_data) {
        const imageData = msg.image_data as { type?: string, data?: number[] } | number[]
        // IPC 传输后 Uint8Array 会变成 {type: 'Buffer', data: [...]} 或普通数组
        if (typeof imageData === 'object' && 'type' in imageData && imageData.type === 'Buffer' && Array.isArray(imageData.data)) {
          return {
            ...msg,
            image_data: new Uint8Array(imageData.data),
          }
        }
        else if (Array.isArray(imageData)) {
          return {
            ...msg,
            image_data: new Uint8Array(imageData),
          }
        }
      }
      return msg
    })
    return messages
  },

  /**
   * 添加消息
   */
  addMessage: async (data: AddMessageParams): Promise<ChatMessage> => {
    const result: unknown = await ipcRenderer.invoke('chat:add-message', data)
    return unwrapIpcResult(result, '添加消息失败')
  },

  /**
   * 更新会话标题
   */
  updateSessionTitle: async (sessionId: string, title: string): Promise<void> => {
    const result: unknown = await ipcRenderer.invoke('chat:update-session-title', sessionId, title)
    unwrapIpcResult(result, '更新标题失败')
  },

  /**
   * 删除会话
   */
  deleteSession: async (sessionId: string): Promise<void> => {
    const result: unknown = await ipcRenderer.invoke('chat:delete-session', sessionId)
    unwrapIpcResult(result, '删除会话失败')
  },

  /**
   * 清空消息
   */
  clearMessages: async (sessionId: string): Promise<void> => {
    const result: unknown = await ipcRenderer.invoke('chat:clear-messages', sessionId)
    unwrapIpcResult(result, '清空消息失败')
  },

  /**
   * 监听图片捕获事件（截图/拍照）
   */
  onImageCaptured: (callback: (data: ImageCapturedEvent) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: ImageCapturedEvent) => callback(data)
    ipcRenderer.on('chat:image-captured', handler)
    return () => ipcRenderer.off('chat:image-captured', handler)
  },

  /**
   * 监听单条消息添加事件
   */
  onMessageAdded: (callback: (data: ChatMessageAddedEvent) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: ChatMessageAddedEvent) => callback(data)
    ipcRenderer.on('chat:message-added', handler)
    return () => ipcRenderer.off('chat:message-added', handler)
  },

  /**
   * 监听批量消息添加事件
   */
  onMessagesBatchAdded: (callback: (data: ChatMessagesBatchAddedEvent) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: ChatMessagesBatchAddedEvent) => callback(data)
    ipcRenderer.on('chat:messages-batch-added', handler)
    return () => ipcRenderer.off('chat:messages-batch-added', handler)
  },

  /**
   * 监听会话创建事件（跨天自动创建新会话）
   */
  onSessionCreated: (callback: (data: ChatSessionCreatedEvent) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: ChatSessionCreatedEvent) => callback(data)
    ipcRenderer.on('chat:session-created', handler)
    return () => ipcRenderer.off('chat:session-created', handler)
  },
}
