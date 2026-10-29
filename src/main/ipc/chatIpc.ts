/**
 * 聊天 IPC 通道
 * 提供聊天会话和消息的数据库操作接口（createIpcHandler + IpcResult）
 */
import type { AddMessageParams, ChatMessage, CreateSessionParams } from '@shared/types'
import type { DbChatMessage } from '../types/database'
import { Buffer } from 'node:buffer'
import { isSourceType } from '@shared/types'
import { getDatabase } from '../services/database'
import { getLogger } from '../utils/logger'
import { createIpcHandler, success } from './middleware'
import { optionalNumber, optionalString, parseObject } from './middleware/validation'

const logger = getLogger('ChatIpc')

function toChatMessageDto(message: DbChatMessage): ChatMessage {
  return {
    id: message.id,
    session_id: message.session_id,
    role: message.role,
    content: message.content,
    emotion: message.emotion,
    sourceType: message.source_type,
    image_data: message.image_data ? new Uint8Array(message.image_data) : null,
    timestamp: message.timestamp,
  }
}

function parseAddMessage(value: unknown): AddMessageParams {
  const data = parseObject(value)
  const sessionId = optionalString(data, 'session_id')
  const content = optionalString(data, 'content')
  if (!sessionId?.trim() || content === undefined)
    throw new Error('session_id 和 content 必须提供')
  if (data.role !== 'user' && data.role !== 'assistant')
    throw new Error('role 必须是 user 或 assistant')
  if (!isSourceType(data.sourceType))
    throw new Error('sourceType 无效')
  if (data.image_data !== undefined && !(data.image_data instanceof Uint8Array))
    throw new Error('image_data 必须是 Uint8Array')
  return {
    session_id: sessionId,
    content,
    role: data.role,
    sourceType: data.sourceType,
    emotion: optionalString(data, 'emotion'),
    image_data: data.image_data,
    timestamp: optionalNumber(data, 'timestamp', { min: 0 }),
  }
}

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
      const data = dataUnknown as CreateSessionParams
      const session = db.createChatSession(data)
      return success(session)
    },
  })

  createIpcHandler<ChatMessage[]>({
    channel: 'chat:get-messages',
    schema: {
      sessionId: { type: 'string', required: true, minLength: 1 },
    },
    handler: async (_event, sessionId: unknown, limitUnknown: unknown, offsetUnknown: unknown) => {
      const limit = typeof limitUnknown === 'number' ? limitUnknown : undefined
      const offset = typeof offsetUnknown === 'number' ? offsetUnknown : 0
      const messages = db.getChatMessages(String(sessionId), limit, offset)

      return success(messages.map(toChatMessageDto))
    },
  })

  createIpcHandler<ChatMessage>({
    channel: 'chat:add-message',
    schema: {
      data: { type: 'object', required: true },
    },
    handler: async (_event, dataUnknown: unknown) => {
      const data = parseAddMessage(dataUnknown)

      // 如果是 Uint8Array，转换为 Buffer
      let imageData: Buffer | undefined
      if (data.image_data) {
        imageData = Buffer.from(data.image_data)
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
      return success(toChatMessageDto(message))
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
