/**
 * 聊天 IPC 通道
 * 提供聊天会话和消息的数据库操作接口（createIpcHandler + IpcResult）
 */
import type { DbChatMessage } from '../types/database'
import { Buffer } from 'node:buffer'
import { getDatabase } from '../services/database'
import { getLogger } from '../utils/logger'
import { createIpcHandler, success } from './middleware'

const logger = getLogger('ChatIpc')

export function registerChatIpc(): void {
  const db = getDatabase()

  createIpcHandler({
    channel: 'chat:get-sessions',
    handler: async (_event, limitUnknown: unknown, offsetUnknown: unknown) => {
      const limit = typeof limitUnknown === 'number' ? limitUnknown : 50
      const offset = typeof offsetUnknown === 'number' ? offsetUnknown : 0
      const sessions = db.getChatSessions(limit, offset)
      return success(sessions)
    },
  })

  createIpcHandler({
    channel: 'chat:get-session',
    schema: {
      sessionId: { type: 'string', required: true, minLength: 1 },
    },
    handler: async (_event, sessionId: unknown) => {
      const session = db.getChatSession(String(sessionId))
      return success(session)
    },
  })

  createIpcHandler({
    channel: 'chat:create-session',
    schema: {
      data: { type: 'object', required: true },
    },
    handler: async (_event, dataUnknown: unknown) => {
      const data = dataUnknown as {
        session_id: string
        title?: string
        started_at?: number
      }
      const session = db.createChatSession(data)
      return success(session)
    },
  })

  createIpcHandler({
    channel: 'chat:get-messages',
    schema: {
      sessionId: { type: 'string', required: true, minLength: 1 },
    },
    handler: async (_event, sessionId: unknown, limitUnknown: unknown, offsetUnknown: unknown) => {
      const limit = typeof limitUnknown === 'number' ? limitUnknown : undefined
      const offset = typeof offsetUnknown === 'number' ? offsetUnknown : 0
      const messages = db.getChatMessages(String(sessionId), limit, offset)

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

      return success(processedMessages)
    },
  })

  createIpcHandler({
    channel: 'chat:add-message',
    schema: {
      data: { type: 'object', required: true },
    },
    handler: async (_event, dataUnknown: unknown) => {
      const data = dataUnknown as {
        session_id: string
        role: 'user' | 'assistant'
        content: string
        emotion?: string
        sourceType: string
        image_data?: Buffer | Uint8Array
        timestamp?: number
      }

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
      return success(message)
    },
  })

  createIpcHandler({
    channel: 'chat:update-session-title',
    schema: {
      sessionId: { type: 'string', required: true, minLength: 1 },
      title: { type: 'string', required: true },
    },
    handler: async (_event, sessionId: unknown, title: unknown) => {
      db.updateChatSessionTitle(String(sessionId), String(title))
      return success()
    },
  })

  createIpcHandler({
    channel: 'chat:delete-session',
    schema: {
      sessionId: { type: 'string', required: true, minLength: 1 },
    },
    handler: async (_event, sessionId: unknown) => {
      db.deleteChatSession(String(sessionId))
      return success()
    },
  })

  createIpcHandler({
    channel: 'chat:clear-messages',
    schema: {
      sessionId: { type: 'string', required: true, minLength: 1 },
    },
    handler: async (_event, sessionId: unknown) => {
      db.clearChatMessages(String(sessionId))
      return success()
    },
  })

  logger.info('聊天 IPC 通道已注册')
}
