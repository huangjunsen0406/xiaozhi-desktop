export interface ServerMessage {
  type: 'llm' | 'tts' | 'stt' | 'mcp' | 'alert' | 'listen' | 'abort'
  state?: 'start' | 'stop' | 'sentence_start' | 'sentence_end' | 'detect'
  text?: string
  emotion?: string
  session_id?: string
  payload?: Record<string, unknown>
}
