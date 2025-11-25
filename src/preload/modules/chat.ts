/**
 * 聊天 API 模块
 */
import { ipcRenderer } from 'electron'

export const chatApi = {
  /**
   * 获取会话列表
   */
  getSessions: async (limit = 50, offset = 0) => {
    const result: any = await ipcRenderer.invoke('chat:get-sessions', limit, offset)
    if (!result.success) {
      throw new Error(result.error || '获取会话列表失败')
    }
    return result.data
  },

  /**
   * 获取单个会话
   */
  getSession: async (sessionId: string) => {
    const result: any = await ipcRenderer.invoke('chat:get-session', sessionId)
    if (!result.success) {
      throw new Error(result.error || '获取会话失败')
    }
    return result.data
  },

  /**
   * 创建会话
   */
  createSession: async (data: { session_id: string, title?: string, started_at?: number }) => {
    const result: any = await ipcRenderer.invoke('chat:create-session', data)
    if (!result.success) {
      throw new Error(result.error || '创建会话失败')
    }
    return result.data
  },

  /**
   * 获取消息列表
   */
  getMessages: async (sessionId: string, limit = 100, offset = 0) => {
    const result: any = await ipcRenderer.invoke('chat:get-messages', sessionId, limit, offset)
    if (!result.success) {
      throw new Error(result.error || '获取消息失败')
    }
    // 将 IPC 传输后的图片数据转换回 Uint8Array
    const messages = result.data.map((msg: any) => {
      if (msg.image_data) {
        // IPC 传输后 Uint8Array 会变成 {type: 'Buffer', data: [...]} 或普通数组
        if (msg.image_data.type === 'Buffer' && Array.isArray(msg.image_data.data)) {
          return {
            ...msg,
            image_data: new Uint8Array(msg.image_data.data),
          }
        }
        else if (Array.isArray(msg.image_data)) {
          return {
            ...msg,
            image_data: new Uint8Array(msg.image_data),
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
  }) => {
    const result: any = await ipcRenderer.invoke('chat:add-message', data)
    if (!result.success) {
      throw new Error(result.error || '添加消息失败')
    }
    return result.data
  },

  /**
   * 更新会话标题
   */
  updateSessionTitle: async (sessionId: string, title: string) => {
    const result: any = await ipcRenderer.invoke('chat:update-session-title', sessionId, title)
    if (!result.success) {
      throw new Error(result.error || '更新标题失败')
    }
  },

  /**
   * 删除会话
   */
  deleteSession: async (sessionId: string) => {
    const result: any = await ipcRenderer.invoke('chat:delete-session', sessionId)
    if (!result.success) {
      throw new Error(result.error || '删除会话失败')
    }
  },

  /**
   * 清空消息
   */
  clearMessages: async (sessionId: string) => {
    const result: any = await ipcRenderer.invoke('chat:clear-messages', sessionId)
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
}
