export type SourceType = 'text' | 'voice' | 'tts' | 'image'
export type ImageSourceType = 'screenshot' | 'camera'

export function isImageSourceType(value: unknown): value is ImageSourceType {
  return value === 'screenshot' || value === 'camera'
}

export interface ChatMessage {
  id?: number
  session_id: string
  role: 'user' | 'assistant'
  content: string
  emotion?: string | null
  sourceType: SourceType
  image_data?: Uint8Array | null
  timestamp: number
  isStreaming?: boolean
}

export interface ChatSession {
  id: number
  session_id: string
  title: string | null
  message_count: number
  started_at: number
  last_message_at: number | null
  active?: boolean
}

export interface AddMessageParams {
  session_id: string
  role: 'user' | 'assistant'
  content: string
  sourceType: SourceType
  emotion?: string
  image_data?: Uint8Array
  timestamp?: number
}

export interface CreateSessionParams {
  session_id: string
  title?: string
  started_at?: number
}

export interface ImageCapturedEvent {
  type: ImageSourceType
  imageBase64: string
  timestamp: number
}

export interface ChatMessageAddedEvent {
  messageId: number
  sessionId: string
  role: 'user' | 'assistant'
  timestamp: number
}

export interface ChatMessagesBatchAddedEvent {
  messageIds: number[]
  sessionId: string
  timestamp: number
}

export interface ChatSessionCreatedEvent {
  sessionId: string
  timestamp: number
}
