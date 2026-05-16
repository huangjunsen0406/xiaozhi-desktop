/**
 * 聊天 IPC 通道
 * 提供聊天会话和消息的数据库操作接口
 */
import type { DbChatMessage } from '../types/database'
import { Buffer } from 'node:buffer'
import { ipcMain } from 'electron'
import { DatabaseManager } from '../services/database'

import { getLogger } from '../utils/logger'

const logger = getLogger('ChatIpc')

export function registerChatIpc(): void {
  const db = DatabaseManager.getInstance()

  /**
   * 获取会话列表
   */
  ipcMain.handle('chat:get-sessions', async (_event, limit = 50, offset = 0) => {
    try {
      const sessions = db.getChatSessions(limit, offset)
      return { success: true, data: sessions }
    }
    catch (error) {
      logger.error('获取会话列表失败', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '获取会话列表失败',
      }
    }
  })

  /**
   * 获取单个会话
   */
  ipcMain.handle('chat:get-session', async (_event, sessionId: string) => {
    try {
      const session = db.getChatSession(sessionId)
      return { success: true, data: session }
    }
    catch (error) {
      logger.error('获取会话失败', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '获取会话失败',
      }
    }
  })

  /**
   * 创建会话
   */
  ipcMain.handle('chat:create-session', async (_event, data: {
    session_id: string
    title?: string
    started_at?: number
  }) => {
    try {
      const session = db.createChatSession(data)
      return { success: true, data: session }
    }
    catch (error) {
      logger.error('创建会话失败', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '创建会话失败',
      }
    }
  })

  /**
   * 获取消息列表
   * @param limit 不传或传undefined则加载所有消息
   */
  ipcMain.handle('chat:get-messages', async (_event, sessionId: string, limit?: number, offset = 0) => {
    try {
      const messages = db.getChatMessages(sessionId, limit, offset)

      // 将 DB 记录转换为 IPC 传输格式：Buffer -> Uint8Array, source_type -> sourceType
      const processedMessages = messages.map((msg: DbChatMessage) => {
        const { source_type, image_data, ...rest } = msg
        return {
          ...rest,
          sourceType: source_type,
          image_data: image_data && Buffer.isBuffer(image_data)
            ? new Uint8Array(image_data)
            : image_data,
        }
      })

      return { success: true, data: processedMessages }
    }
    catch (error) {
      logger.error('获取消息失败', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '获取消息失败',
      }
    }
  })

  /**
   * 添加消息
   */
  ipcMain.handle('chat:add-message', async (_event, data: {
    session_id: string
    role: 'user' | 'assistant'
    content: string
    emotion?: string
    sourceType: string
    image_data?: Buffer | Uint8Array
    timestamp?: number
  }) => {
    try {
      // 如果是 Uint8Array，转换为 Buffer
      let imageData: Buffer | undefined
      if (data.image_data) {
        imageData = Buffer.isBuffer(data.image_data)
          ? data.image_data
          : Buffer.from(data.image_data)
      }

      // Translate sourceType -> source_type for DB layer
      const message = db.addChatMessage({
        session_id: data.session_id,
        role: data.role,
        content: data.content,
        emotion: data.emotion,
        source_type: data.sourceType,
        image_data: imageData,
        timestamp: data.timestamp,
      })
      return { success: true, data: message }
    }
    catch (error) {
      logger.error('添加消息失败', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '添加消息失败',
      }
    }
  })

  /**
   * 更新会话标题
   */
  ipcMain.handle('chat:update-session-title', async (_event, sessionId: string, title: string) => {
    try {
      db.updateChatSessionTitle(sessionId, title)
      return { success: true }
    }
    catch (error) {
      logger.error('更新标题失败', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '更新标题失败',
      }
    }
  })

  /**
   * 删除会话
   */
  ipcMain.handle('chat:delete-session', async (_event, sessionId: string) => {
    try {
      db.deleteChatSession(sessionId)
      return { success: true }
    }
    catch (error) {
      logger.error('删除会话失败', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '删除会话失败',
      }
    }
  })

  /**
   * 清空消息
   */
  ipcMain.handle('chat:clear-messages', async (_event, sessionId: string) => {
    try {
      db.clearChatMessages(sessionId)
      return { success: true }
    }
    catch (error) {
      logger.error('清空消息失败', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '清空消息失败',
      }
    }
  })

  logger.info('聊天 IPC 通道已注册')
}
