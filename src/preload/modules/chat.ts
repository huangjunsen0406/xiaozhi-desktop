/**
 * 聊天 API 模块
 */
import { ipcRenderer } from 'electron'

/**
 * IPC 结果类型
 */
interface IpcResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

/**
 * 聊天消息类型
 */
interface ChatMessage {
  id: number
  session_id: string
  role: 'user' | 'assistant'
  content: string
  emotion?: string
  source_type: string
  image_data?: Uint8Array | { type: string, data: number[] } | number[]
  timestamp: number
}

/**
 * 聊天会话类型
 */
interface ChatSession {
  id: number
  session_id: string
  title?: string
  message_count: number
  started_at: number
  last_message_at?: number
}

/**
 * 流式消息状态
 */
interface StreamingState {
  sessionId: string
  role: 'assistant'
  content: string
  emotion?: string
  updatedAt: number
}

export const chatApi = {
  /**
   * 获取会话列表
   */
  getSessions: async (limit = 50, offset = 0): Promise<ChatSession[]> => {
    const result = await ipcRenderer.invoke('chat:get-sessions', limit, offset) as IpcResult<ChatSession[]>
    if (!result.success) {
      throw new Error(result.error || '获取会话列表失败')
    }
    return result.data || []
  },

  /**
   * 获取单个会话
   */
  getSession: async (sessionId: string): Promise<ChatSession | null> => {
    const result = await ipcRenderer.invoke('chat:get-session', sessionId) as IpcResult<ChatSession>
    if (!result.success) {
      throw new Error(result.error || '获取会话失败')
    }
    return result.data || null
  },

  /**
   * 创建会话
   */
  createSession: async (data: { session_id: string, title?: string, started_at?: number }): Promise<ChatSession> => {
    const result = await ipcRenderer.invoke('chat:create-session', data) as IpcResult<ChatSession>
    if (!result.success) {
      throw new Error(result.error || '创建会话失败')
    }
    return result.data!
  },

  /**
   * 获取消息列表
   */
  getMessages: async (sessionId: string, limit = 100, offset = 0): Promise<ChatMessage[]> => {
    const result = await ipcRenderer.invoke('chat:get-messages', sessionId, limit, offset) as IpcResult<ChatMessage[]>
    if (!result.success) {
      throw new Error(result.error || '获取消息失败')
    }
    // 将 IPC 传输后的图片数据转换回 Uint8Array
    const messages = (result.data || []).map((msg: ChatMessage) => {
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
  addMessage: async (data: {
    session_id: string
    role: 'user' | 'assistant'
    content: string
    emotion?: string
    source_type: string
    image_data?: Uint8Array
    timestamp?: number
  }): Promise<ChatMessage> => {
    const result = await ipcRenderer.invoke('chat:add-message', data) as IpcResult<ChatMessage>
    if (!result.success) {
      throw new Error(result.error || '添加消息失败')
    }
    return result.data!
  },

  /**
   * 更新会话标题
   */
  updateSessionTitle: async (sessionId: string, title: string): Promise<void> => {
    const result = await ipcRenderer.invoke('chat:update-session-title', sessionId, title) as IpcResult<void>
    if (!result.success) {
      throw new Error(result.error || '更新标题失败')
    }
  },

  /**
   * 删除会话
   */
  deleteSession: async (sessionId: string): Promise<void> => {
    const result = await ipcRenderer.invoke('chat:delete-session', sessionId) as IpcResult<void>
    if (!result.success) {
      throw new Error(result.error || '删除会话失败')
    }
  },

  /**
   * 清空消息
   */
  clearMessages: async (sessionId: string): Promise<void> => {
    const result = await ipcRenderer.invoke('chat:clear-messages', sessionId) as IpcResult<void>
    if (!result.success) {
      throw new Error(result.error || '清空消息失败')
    }
  },

  /**
   * 监听图片捕获事件（截图/拍照）
   */
  onImageCaptured: (callback: (data: { type: 'screenshot' | 'camera', imageBase64: string, timestamp: number }) => void) => {
    ipcRenderer.on('chat:image-captured', (_, data) => callback(data))
  },

  /**
   * 移除图片捕获监听器
   */
  removeImageCapturedListener: () => {
    ipcRenderer.removeAllListeners('chat:image-captured')
  },

  /**
   * 监听单条消息添加事件
   */
  onMessageAdded: (callback: (data: { messageId: number, sessionId: string, role: 'user' | 'assistant', timestamp: number }) => void) => {
    ipcRenderer.on('chat:message-added', (_, data) => callback(data))
  },

  /**
   * 移除单条消息添加监听器
   */
  removeMessageAddedListener: () => {
    ipcRenderer.removeAllListeners('chat:message-added')
  },

  /**
   * 监听批量消息添加事件
   */
  onMessagesBatchAdded: (callback: (data: { messageIds: number[], sessionId: string, timestamp: number }) => void) => {
    ipcRenderer.on('chat:messages-batch-added', (_, data) => callback(data))
  },

  /**
   * 移除批量消息添加监听器
   */
  removeMessagesBatchAddedListener: () => {
    ipcRenderer.removeAllListeners('chat:messages-batch-added')
  },

  /**
   * 获取当前流式消息状态快照（用于新窗口补偿）
   */
  getStreamingState: async (): Promise<StreamingState | null> => {
    const result = await ipcRenderer.invoke('chat:get-streaming-state') as IpcResult<StreamingState | null>
    if (!result.success) {
      throw new Error(result.error || '获取流式状态失败')
    }
    return result.data ?? null
  },

  /**
   * 监听流式消息增量更新
   */
  onStreamingUpdate: (callback: (data: StreamingState) => void) => {
    ipcRenderer.on('chat:streaming-update', (_, data) => callback(data))
  },

  /**
   * 监听流式消息完成事件
   */
  onStreamingFinalize: (callback: (data: StreamingState) => void) => {
    ipcRenderer.on('chat:streaming-finalize', (_, data) => callback(data))
  },

  /**
   * 移除流式相关监听器
   */
  removeStreamingListeners: () => {
    ipcRenderer.removeAllListeners('chat:streaming-update')
    ipcRenderer.removeAllListeners('chat:streaming-finalize')
  },
}
