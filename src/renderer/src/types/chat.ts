import type {
  AddMessageParams,
  CreateSessionParams,
  ImageCapturedEvent,
  ServerMessage,
} from '@shared/types'

export interface ChatMessage {
  id?: number
  sessionId?: string
  role: 'user' | 'assistant'
  content: string
  emotion?: string
  sourceType?: string
  imageData?: Uint8Array
  timestamp: number
  isStreaming?: boolean
}

export interface StreamingState {
  sessionId: string
  role: 'assistant'
  content: string
  emotion?: string
  updatedAt: number
}

export interface ChatSession {
  id: number
  sessionId: string
  title: string
  active: boolean
  messageCount: number
  lastMessageAt: number
}

export interface GroupedSessions {
  date: string
  timestamp: number
  sessions: ChatSession[]
}

export type {
  AddMessageParams,
  CreateSessionParams,
  ImageCapturedEvent,
  ServerMessage,
}
