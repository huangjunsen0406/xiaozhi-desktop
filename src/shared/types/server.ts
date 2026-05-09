export interface ServerMessage {
  type: 'llm' | 'tts' | 'stt' | 'mcp' | 'alert' | 'listen' | 'abort' | string
  state?: 'start' | 'stop' | 'sentence_start' | 'sentence_end' | 'detect'
  text?: string
  emotion?: string
  session_id?: string
  payload?: {
    jsonrpc?: string
    id?: string | number
    method?: string
    params?: {
      name?: string
      [key: string]: unknown
    }
    result?: unknown
    error?: {
      code: number
      message: string
      data?: unknown
    }
    [key: string]: unknown
  }
  [key: string]: unknown
}
