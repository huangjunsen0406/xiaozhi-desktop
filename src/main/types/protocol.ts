import type {
  ActivationData,
  MqttInfo,
  NetworkConfig,
  ServerAbortMessage,
  ServerAlertMessage,
  ServerGoodbyeMessage,
  ServerHelloMessage,
  ServerImageMessage,
  ServerListenMessage,
  ServerLlmMessage,
  ServerMcpMessage,
  ServerMcpPayload,
  ServerMessage,
  ServerSttMessage,
  ServerTtsMessage,
  ServerUdpTransportConfig,
} from '@shared/types'
import {
  isServerImageMessage,
  isServerLlmMessage,
  isServerMcpMessage,
  isServerMessage,
  isServerSttMessage,
  isServerTtsMessage,
  parseServerMessage,
} from '@shared/types'

/** @deprecated 使用 ServerMessage；保留别名供 main 插件渐进迁移 */
export type JsonMessage = ServerMessage

/** MQTT/UDP hello 中验证完整后的 UDP 传输配置。 */
export type UdpTransportConfig = Required<ServerUdpTransportConfig>
export type HelloJsonMessage = ServerHelloMessage
export type GoodbyeJsonMessage = ServerGoodbyeMessage

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

// --- 与 shared ServerMessage 对齐的别名（main 历史命名）---
export type TtsJsonMessage = ServerTtsMessage
export type SttJsonMessage = ServerSttMessage
export type LlmJsonMessage = ServerLlmMessage
export type ListenJsonMessage = ServerListenMessage
export type AbortJsonMessage = ServerAbortMessage
export type McpJsonMessage = ServerMcpMessage
export type AlertJsonMessage = ServerAlertMessage
export type ImageJsonMessage = ServerImageMessage
export type McpPayload = ServerMcpPayload
export type HelloJsonMessageShared = ServerHelloMessage
export type GoodbyeJsonMessageShared = ServerGoodbyeMessage
export type ProtocolJsonMessage = ServerMessage

export {
  isServerImageMessage as isImageMessage,
  isServerLlmMessage as isLlmMessage,
  isServerMcpMessage as isMcpMessage,
  isServerMessage,
  isServerSttMessage as isSttMessage,
  isServerTtsMessage as isTtsMessage,
  parseServerMessage,
}

export type { ActivationData, MqttInfo, NetworkConfig }
