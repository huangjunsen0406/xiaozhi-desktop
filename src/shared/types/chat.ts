export interface ChatMessage {
  id?: number
  session_id: string
  role: 'user' | 'assistant'
  content: string
  emotion?: string | null
  source_type: string
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
  source_type?: 'text' | 'voice' | 'tts' | 'image'
  emotion?: string
  image_data?: Uint8Array
  timestamp: number
}

export interface CreateSessionParams {
  session_id: string
  title?: string
  started_at?: number
}

export interface ImageCapturedEvent {
  type: 'screenshot' | 'camera'
  imageBase64: string
  timestamp: number
}
