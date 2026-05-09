import type { ActivationData, MqttInfo, NetworkConfig } from '@shared/types'

export interface JsonMessage {
  type: string
  session_id?: string
  [key: string]: unknown
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
