/**
 * 服务端下行 JSON 消息（跨 main / preload / renderer）
 *
 * 以 `type` 为判别字段的联合类型；解析未知 JSON 时用 parseServerMessage。
 * 传输层帧发送见 Protocol.sendRawText；用户话语见 ConversationSession.sendText。
 */

/** MCP JSON-RPC 载荷（嵌在 type=mcp 的消息里） */
export interface ServerMcpPayload {
  jsonrpc?: string
  id?: string | number
  method?: string
  params?: Record<string, unknown>
  result?: unknown
  error?: {
    code?: number
    message?: string
    data?: unknown
  }
}

export interface ServerHelloMessage {
  type: 'hello'
  version?: number
  transport?: string
  session_id?: string
  audio_params?: {
    format?: string
    sample_rate?: number
    channels?: number
    frame_duration?: number
  }
  udp?: {
    server?: string
    port?: number
    key?: string
    nonce?: string
  }
  /** 允许服务端扩展字段，解析后仍保留 */
  [key: string]: unknown
}

export interface ServerGoodbyeMessage {
  type: 'goodbye'
  session_id?: string
  [key: string]: unknown
}

export interface ServerTtsMessage {
  type: 'tts'
  state: 'start' | 'stop' | 'sentence_start' | 'sentence_end'
  text?: string
  session_id?: string
  [key: string]: unknown
}

export interface ServerSttMessage {
  type: 'stt'
  text: string
  session_id?: string
  [key: string]: unknown
}

export interface ServerLlmMessage {
  type: 'llm'
  text?: string
  emotion?: string
  session_id?: string
  [key: string]: unknown
}

export interface ServerListenMessage {
  type: 'listen'
  state?: 'start' | 'stop' | 'detect'
  mode?: string
  text?: string
  session_id?: string
  [key: string]: unknown
}

export interface ServerAbortMessage {
  type: 'abort'
  reason?: string
  session_id?: string
  [key: string]: unknown
}

export interface ServerMcpMessage {
  type: 'mcp'
  payload?: ServerMcpPayload
  session_id?: string
  [key: string]: unknown
}

export interface ServerAlertMessage {
  type: 'alert'
  message?: string
  text?: string
  code?: string
  session_id?: string
  [key: string]: unknown
}

/** 未建模的扩展 type（向前兼容） */
export interface ServerUnknownMessage {
  type: string
  session_id?: string
  text?: string
  state?: string
  emotion?: string
  payload?: unknown
  [key: string]: unknown
}

/**
 * 判别联合：已知 type 收窄；其余落入 ServerUnknownMessage
 */
export type ServerMessage
  = | ServerHelloMessage
    | ServerGoodbyeMessage
    | ServerTtsMessage
    | ServerSttMessage
    | ServerLlmMessage
    | ServerListenMessage
    | ServerAbortMessage
    | ServerMcpMessage
    | ServerAlertMessage
    | ServerUnknownMessage

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

const TTS_STATES = new Set(['start', 'stop', 'sentence_start', 'sentence_end'])

/**
 * 将 unknown JSON 收窄为 ServerMessage（不抛；非法输入返回 unknown 分支或 null）
 */
export function parseServerMessage(data: unknown): ServerMessage | null {
  if (!isRecord(data) || typeof data.type !== 'string' || data.type.length === 0) {
    return null
  }

  const type = data.type
  const base = data as ServerUnknownMessage

  switch (type) {
    case 'hello':
      return base as ServerHelloMessage
    case 'goodbye':
      return base as ServerGoodbyeMessage
    case 'tts': {
      const state = data.state
      if (typeof state === 'string' && TTS_STATES.has(state)) {
        return base as ServerTtsMessage
      }
      return base as ServerUnknownMessage
    }
    case 'stt': {
      if (typeof data.text === 'string') {
        return base as ServerSttMessage
      }
      return base as ServerUnknownMessage
    }
    case 'llm':
      return base as ServerLlmMessage
    case 'listen':
      return base as ServerListenMessage
    case 'abort':
      return base as ServerAbortMessage
    case 'mcp':
      return base as ServerMcpMessage
    case 'alert':
      return base as ServerAlertMessage
    default:
      return base as ServerUnknownMessage
  }
}

export function isServerTtsMessage(msg: ServerMessage): msg is ServerTtsMessage {
  return msg.type === 'tts' && typeof (msg as ServerTtsMessage).state === 'string'
}

export function isServerSttMessage(msg: ServerMessage): msg is ServerSttMessage {
  return msg.type === 'stt' && typeof (msg as ServerSttMessage).text === 'string'
}

export function isServerLlmMessage(msg: ServerMessage): msg is ServerLlmMessage {
  return msg.type === 'llm'
}

export function isServerMcpMessage(msg: ServerMessage): msg is ServerMcpMessage {
  return msg.type === 'mcp'
}
