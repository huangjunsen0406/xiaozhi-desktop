/**
 * 数据转换工具函数
 * 统一处理 IPC 数据和前端数据的转换
 */

import type { ChatMessage as IpcChatMessage, ChatSession as IpcChatSession } from '@shared/types'
import type { ChatMessage as ChatMessageType, ChatSession } from '../types/chat'

/**
 * 将 IPC ChatSession 转换为前端 ChatSession
 * @param session IPC 会话数据
 * @param isActive 是否为当前活动会话
 * @returns 前端会话对象
 */
export function mapIpcSessionToChatSession(
  session: IpcChatSession,
  isActive: boolean,
): ChatSession {
  return {
    id: session.id,
    sessionId: session.session_id,
    title: session.title || '新对话',
    active: isActive,
    messageCount: session.message_count,
    lastMessageAt: session.last_message_at ?? session.started_at,
  }
}

/**
 * 将 IPC ChatMessage 转换为前端 ChatMessage
 * @param msg IPC 消息数据
 * @returns 前端消息对象
 */
export function mapIpcMessageToChatMessage(msg: IpcChatMessage): ChatMessageType {
  return {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    emotion: msg.emotion ?? undefined,
    imageData: msg.image_data ?? undefined,
    timestamp: msg.timestamp,
  }
}
