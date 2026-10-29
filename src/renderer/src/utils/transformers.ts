/**
 * 数据转换工具函数
 * 统一处理 IPC 数据和前端数据的转换
 */

import type { ChatMessage as IpcChatMessage, ChatSession as IpcChatSession } from '@shared/types'
import type { ChatMessage as ChatMessageType, ChatSession } from '../types/chat'
import { formatSessionListTitle } from './dateUtils'

/**
 * 将 IPC ChatSession 转换为前端 ChatSession
 * 列表优先展示首条消息摘要（preview），标题回退 formatSessionListTitle
 */
export function mapIpcSessionToChatSession(session: IpcChatSession): ChatSession {
  const preview = session.preview?.replace(/\s+/g, ' ').trim() || null
  const title = formatSessionListTitle(session.title, session.started_at, session.session_id)
  return {
    id: session.id,
    sessionId: session.session_id,
    // 侧栏：有首条消息摘要用 preview；否则 title（新会话为「新对话」）
    title,
    preview: preview || title,
    messageCount: session.message_count,
    lastMessageAt: session.last_message_at ?? session.started_at,
  }
}

/**
 * 将 IPC ChatMessage 转换为前端 ChatMessage
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
