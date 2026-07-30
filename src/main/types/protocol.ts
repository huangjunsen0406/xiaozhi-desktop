import type { ActivationData, MqttInfo, NetworkConfig } from '@shared/types'

export interface JsonMessage {
  type: string
  session_id?: string
  [key: string]: unknown
}

/** MQTT/UDP hello 中的 UDP 传输配置 */
export interface UdpTransportConfig {
  server: string
  port: number
  key: string
  nonce: string
}

export interface HelloJsonMessage extends JsonMessage {
  type: 'hello'
  version?: number
  transport?: string
  session_id?: string
  audio_params?: {
    format: string
    sample_rate: number
    channels: number
    frame_duration: number
  }
  /** MQTT + UDP 通道时由服务端下发 */
  udp?: UdpTransportConfig
}

export interface GoodbyeJsonMessage extends JsonMessage {
  type: 'goodbye'
  session_id?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isUdpTransportConfig(value: unknown): value is UdpTransportConfig {
  return isRecord(value)
    && typeof value.server === 'string'
    && typeof value.port === 'number'
    && typeof value.key === 'string'
    && typeof value.nonce === 'string'
}

export function isHelloMessage(msg: JsonMessage): msg is HelloJsonMessage {
  return msg.type === 'hello'
}

export function isGoodbyeMessage(msg: JsonMessage): msg is GoodbyeJsonMessage {
  return msg.type === 'goodbye'
}

/**
 * 从 unknown 收窄 MQTT 服务端 hello（transport=udp + udp 配置）。
 * 不满足时返回 null，由调用方记日志。
 */
export function parseMqttServerHello(data: unknown): {
  sessionId: string
  udp: UdpTransportConfig
} | null {
  if (!isRecord(data) || data.type !== 'hello') {
    return null
  }
  if (data.transport !== 'udp') {
    return null
  }
  if (!isUdpTransportConfig(data.udp)) {
    return null
  }
  return {
    sessionId: typeof data.session_id === 'string' ? data.session_id : '',
    udp: data.udp,
  }
}

export interface TtsJsonMessage extends JsonMessage {
  type: 'tts'
  state: 'start' | 'stop' | 'sentence_start' | 'sentence_end'
  text?: string
}

export interface ListenJsonMessage extends JsonMessage {
  type: 'listen'
  state: 'start' | 'stop' | 'detect'
  mode?: string
  text?: string
}

export interface AbortJsonMessage extends JsonMessage {
  type: 'abort'
  reason?: string
}

export interface McpJsonMessage extends JsonMessage {
  type: 'mcp'
  payload: McpPayload
}

export interface McpPayload {
  jsonrpc: string
  id?: string | number
  method?: string
  params?: Record<string, unknown>
  result?: unknown
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

export interface SttJsonMessage extends JsonMessage {
  type: 'stt'
  text: string
}

export interface LlmJsonMessage extends JsonMessage {
  type: 'llm'
  emotion?: string
  text?: string
}

export interface AlertJsonMessage extends JsonMessage {
  type: 'alert'
  message?: string
  code?: string
}

export type ProtocolJsonMessage
  = | HelloJsonMessage
    | TtsJsonMessage
    | ListenJsonMessage
    | AbortJsonMessage
    | McpJsonMessage
    | SttJsonMessage
    | LlmJsonMessage
    | AlertJsonMessage
    | JsonMessage

export function isTtsMessage(msg: JsonMessage): msg is TtsJsonMessage {
  return msg.type === 'tts' && typeof (msg as TtsJsonMessage).state === 'string'
}

export function isSttMessage(msg: JsonMessage): msg is SttJsonMessage {
  return msg.type === 'stt' && typeof (msg as SttJsonMessage).text === 'string'
}

export function isLlmMessage(msg: JsonMessage): msg is LlmJsonMessage {
  return msg.type === 'llm'
}

export function isMcpMessage(msg: JsonMessage): msg is McpJsonMessage {
  return msg.type === 'mcp' && (msg as McpJsonMessage).payload !== undefined
}

export function isAlertMessage(msg: JsonMessage): msg is AlertJsonMessage {
  return msg.type === 'alert'
}

export type { ActivationData, MqttInfo, NetworkConfig }
