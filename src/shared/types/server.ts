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

export interface ServerAudioParams {
  format?: string
  sample_rate?: number
  channels?: number
  frame_duration?: number
}

export interface ServerUdpTransportConfig {
  server?: string
  port?: number
  key?: string
  nonce?: string
}

export interface ServerHelloMessage {
  type: 'hello'
  version?: number
  transport?: string
  session_id?: string
  audio_params?: ServerAudioParams
  udp?: ServerUdpTransportConfig
}

export interface ServerGoodbyeMessage {
  type: 'goodbye'
  session_id?: string
}

export interface ServerTtsMessage {
  type: 'tts'
  state: 'start' | 'stop' | 'sentence_start' | 'sentence_end'
  text?: string
  session_id?: string
}

export interface ServerSttMessage {
  type: 'stt'
  text: string
  session_id?: string
}

export interface ServerLlmMessage {
  type: 'llm'
  text?: string
  emotion?: string
  session_id?: string
}

export interface ServerListenMessage {
  type: 'listen'
  state?: 'start' | 'stop' | 'detect'
  mode?: string
  text?: string
  session_id?: string
}

export interface ServerAbortMessage {
  type: 'abort'
  reason?: string
  session_id?: string
}

export interface ServerMcpMessage {
  type: 'mcp'
  payload?: ServerMcpPayload
  session_id?: string
}

export interface ServerAlertMessage {
  type: 'alert'
  message?: string
  text?: string
  code?: string
  session_id?: string
}

export interface ServerImageMessage {
  type: 'image'
  image_data: string
  image_type?: string
  session_id?: string
}

/** 未建模的扩展 type（向前兼容） */
export interface ServerUnknownMessage {
  type: 'unknown'
  originalType: string
  session_id?: string
  text?: string
  state?: string
  emotion?: string
  payload?: unknown
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
    | ServerImageMessage
    | ServerUnknownMessage

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getOptionalString(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key]
  return typeof value === 'string' ? value : undefined
}

function getOptionalNumber(data: Record<string, unknown>, key: string): number | undefined {
  const value = data[key]
  return typeof value === 'number' ? value : undefined
}

function getOptionalAudioParams(data: Record<string, unknown>): ServerAudioParams | undefined {
  if (!isRecord(data.audio_params)) {
    return undefined
  }
  const params = data.audio_params
  return {
    format: getOptionalString(params, 'format'),
    sample_rate: getOptionalNumber(params, 'sample_rate'),
    channels: getOptionalNumber(params, 'channels'),
    frame_duration: getOptionalNumber(params, 'frame_duration'),
  }
}

function getOptionalUdpConfig(data: Record<string, unknown>): ServerUdpTransportConfig | undefined {
  if (!isRecord(data.udp)) {
    return undefined
  }
  const udp = data.udp
  return {
    server: getOptionalString(udp, 'server'),
    port: getOptionalNumber(udp, 'port'),
    key: getOptionalString(udp, 'key'),
    nonce: getOptionalString(udp, 'nonce'),
  }
}

function isServerTtsState(value: string): value is ServerTtsMessage['state'] {
  return value === 'start'
    || value === 'stop'
    || value === 'sentence_start'
    || value === 'sentence_end'
}

function isServerListenState(value: string): value is NonNullable<ServerListenMessage['state']> {
  return value === 'start' || value === 'stop' || value === 'detect'
}

function getOptionalListenState(data: Record<string, unknown>): ServerListenMessage['state'] {
  const state = getOptionalString(data, 'state')
  return state && isServerListenState(state) ? state : undefined
}

function isServerMcpPayload(value: unknown): value is ServerMcpPayload {
  if (!isRecord(value)) {
    return false
  }
  if ('jsonrpc' in value && typeof value.jsonrpc !== 'string') {
    return false
  }
  if ('id' in value && typeof value.id !== 'string' && typeof value.id !== 'number') {
    return false
  }
  if ('method' in value && typeof value.method !== 'string') {
    return false
  }
  if ('params' in value && !isRecord(value.params)) {
    return false
  }
  if ('error' in value) {
    if (!isRecord(value.error)) {
      return false
    }
    if ('code' in value.error && typeof value.error.code !== 'number') {
      return false
    }
    if ('message' in value.error && typeof value.error.message !== 'string') {
      return false
    }
  }
  return true
}

/**
 * 将 unknown JSON 收窄为 ServerMessage（不抛；非法输入返回 unknown 分支或 null）
 */
export function parseServerMessage(data: unknown): ServerMessage | null {
  if (!isRecord(data) || typeof data.type !== 'string' || data.type.length === 0) {
    return null
  }

  const type = data.type
  const session_id = getOptionalString(data, 'session_id')
  const text = getOptionalString(data, 'text')

  switch (type) {
    case 'hello':
      return {
        type,
        version: getOptionalNumber(data, 'version'),
        transport: getOptionalString(data, 'transport'),
        session_id,
        audio_params: getOptionalAudioParams(data),
        udp: getOptionalUdpConfig(data),
      }
    case 'goodbye':
      return { type, session_id }
    case 'tts': {
      const state = data.state
      if (typeof state === 'string' && isServerTtsState(state)) {
        return { type, state, text, session_id }
      }
      return createUnknownMessage(data, type)
    }
    case 'stt': {
      if (text !== undefined) {
        return { type, text, session_id }
      }
      return createUnknownMessage(data, type)
    }
    case 'llm':
      return { type, text, emotion: getOptionalString(data, 'emotion'), session_id }
    case 'listen':
      return {
        type,
        state: getOptionalListenState(data),
        mode: getOptionalString(data, 'mode'),
        text,
        session_id,
      }
    case 'abort':
      return { type, reason: getOptionalString(data, 'reason'), session_id }
    case 'mcp':
      if (!('payload' in data)) {
        return { type, session_id }
      }
      if (!isServerMcpPayload(data.payload)) {
        return createUnknownMessage(data, type)
      }
      return { type, payload: data.payload, session_id }
    case 'alert':
      return {
        type,
        message: getOptionalString(data, 'message'),
        text,
        code: getOptionalString(data, 'code'),
        session_id,
      }
    case 'image':
      if (typeof data.image_data === 'string') {
        return {
          type,
          image_data: data.image_data,
          image_type: getOptionalString(data, 'image_type'),
          session_id,
        }
      }
      return createUnknownMessage(data, type)
    default:
      return createUnknownMessage(data, type)
  }
}

function createUnknownMessage(data: Record<string, unknown>, originalType: string): ServerUnknownMessage {
  return {
    type: 'unknown',
    originalType,
    session_id: getOptionalString(data, 'session_id'),
    text: getOptionalString(data, 'text'),
    state: getOptionalString(data, 'state'),
    emotion: getOptionalString(data, 'emotion'),
    payload: data.payload,
  }
}

const SERVER_MESSAGE_TYPES = new Set<string>([
  'hello',
  'goodbye',
  'tts',
  'stt',
  'llm',
  'listen',
  'abort',
  'mcp',
  'alert',
  'image',
  'unknown',
])

/**
 * 非破坏性 type guard：判断是否已是 ServerMessage（含 type:'unknown'）。
 *
 * 协议入口用 parseServerMessage 从 raw JSON 归一化一次；
 * EventBus 订阅方只用本函数，禁止再次 parse（会把 unknown 二次抹掉 originalType）。
 */
export function isServerMessage(value: unknown): value is ServerMessage {
  if (!isRecord(value) || typeof value.type !== 'string' || value.type.length === 0) {
    return false
  }
  if (value.type === 'unknown') {
    return typeof value.originalType === 'string'
  }
  return SERVER_MESSAGE_TYPES.has(value.type)
}

export function isServerTtsMessage(msg: ServerMessage): msg is ServerTtsMessage {
  return msg.type === 'tts'
}

export function isServerSttMessage(msg: ServerMessage): msg is ServerSttMessage {
  return msg.type === 'stt'
}

export function isServerLlmMessage(msg: ServerMessage): msg is ServerLlmMessage {
  return msg.type === 'llm'
}

export function isServerMcpMessage(msg: ServerMessage): msg is ServerMcpMessage {
  return msg.type === 'mcp'
}

export function isServerImageMessage(msg: ServerMessage): msg is ServerImageMessage {
  return msg.type === 'image'
}
