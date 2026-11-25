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
import { invokeData, invokeVoid, subscribeChannel } from '../utils/ipc'

export const chatApi = {
  getSessions: async (limit = 50, offset = 0): Promise<ChatSession[]> =>
    (await invokeData<ChatSession[] | undefined>('chat:get-sessions', '获取会话列表失败', limit, offset)) ?? [],

  getSession: async (sessionId: string): Promise<ChatSession | null> =>
    (await invokeData<ChatSession | undefined>('chat:get-session', '获取会话失败', sessionId)) ?? null,

  createSession: (data: CreateSessionParams): Promise<ChatSession> =>
    invokeData('chat:create-session', '创建会话失败', data),

  getMessages: (sessionId: string, limit?: number, offset = 0): Promise<ChatMessage[]> =>
    invokeData('chat:get-messages', '获取消息失败', sessionId, limit, offset),

  addMessage: (data: AddMessageParams): Promise<ChatMessage> =>
    invokeData('chat:add-message', '添加消息失败', data),

  updateSessionTitle: (sessionId: string, title: string): Promise<void> =>
    invokeVoid('chat:update-session-title', '更新标题失败', sessionId, title),

  deleteSession: (sessionId: string): Promise<void> =>
    invokeVoid('chat:delete-session', '删除会话失败', sessionId),

  clearMessages: (sessionId: string): Promise<void> =>
    invokeVoid('chat:clear-messages', '清空消息失败', sessionId),

  onImageCaptured: (callback: (data: ImageCapturedEvent) => void): () => void =>
    subscribeChannel('chat:image-captured', callback),

  onMessageAdded: (callback: (data: ChatMessageAddedEvent) => void): () => void =>
    subscribeChannel('chat:message-added', callback),

  onMessagesBatchAdded: (callback: (data: ChatMessagesBatchAddedEvent) => void): () => void =>
    subscribeChannel('chat:messages-batch-added', callback),

  onSessionCreated: (callback: (data: ChatSessionCreatedEvent) => void): () => void =>
    subscribeChannel('chat:session-created', callback),
}
