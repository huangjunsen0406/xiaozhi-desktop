/**
 * 协议层类型定义
 */

/**
 * JSON 消息基础类型
 */
export interface JsonMessage {
  type: string
  session_id?: string
  [key: string]: unknown
}

/**
 * Hello 消息
 */
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

/**
 * TTS 状态消息
 */
export interface TtsJsonMessage extends JsonMessage {
  type: 'tts'
  state: 'start' | 'stop' | 'sentence_start' | 'sentence_end'
  text?: string
}

/**
 * 监听状态消息
 */
export interface ListenJsonMessage extends JsonMessage {
  type: 'listen'
  state: 'start' | 'stop' | 'detect'
  mode?: string
  text?: string
}

/**
 * 中止消息
 */
export interface AbortJsonMessage extends JsonMessage {
  type: 'abort'
  reason?: string
}

/**
 * IoT 消息
 */
export interface IotJsonMessage extends JsonMessage {
  type: 'iot'
  update?: boolean
  descriptors?: IotDescriptor[]
  states?: Record<string, unknown>
}

/**
 * IoT 设备描述符
 */
export interface IotDescriptor {
  name: string
  description?: string
  properties?: Record<string, unknown>
  methods?: Record<string, unknown>
}

/**
 * MCP 消息
 */
export interface McpJsonMessage extends JsonMessage {
  type: 'mcp'
  payload: McpPayload
}

/**
 * MCP 负载
 */
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

/**
 * STT 消息（语音转文字结果）
 */
export interface SttJsonMessage extends JsonMessage {
  type: 'stt'
  text: string
}

/**
 * LLM 消息（大模型输出）
 */
export interface LlmJsonMessage extends JsonMessage {
  type: 'llm'
  emotion?: string
  text?: string
}

/**
 * Alert 消息（服务端警告/错误）
 */
export interface AlertJsonMessage extends JsonMessage {
  type: 'alert'
  message?: string
  code?: string
}

/**
 * 所有支持的 JSON 消息类型联合
 */
export type ProtocolJsonMessage =
  | HelloJsonMessage
  | TtsJsonMessage
  | ListenJsonMessage
  | AbortJsonMessage
  | IotJsonMessage
  | McpJsonMessage
  | SttJsonMessage
  | LlmJsonMessage
  | AlertJsonMessage
  | JsonMessage

// ==================== 类型守卫函数 ====================

/**
 * 检查是否为 TTS 消息
 */
export function isTtsMessage(msg: JsonMessage): msg is TtsJsonMessage {
  return msg.type === 'tts' && typeof (msg as TtsJsonMessage).state === 'string'
}

/**
 * 检查是否为 STT 消息
 */
export function isSttMessage(msg: JsonMessage): msg is SttJsonMessage {
  return msg.type === 'stt' && typeof (msg as SttJsonMessage).text === 'string'
}

/**
 * 检查是否为 LLM 消息
 */
export function isLlmMessage(msg: JsonMessage): msg is LlmJsonMessage {
  return msg.type === 'llm'
}

/**
 * 检查是否为 MCP 消息
 */
export function isMcpMessage(msg: JsonMessage): msg is McpJsonMessage {
  return msg.type === 'mcp' && (msg as McpJsonMessage).payload !== undefined
}

/**
 * 检查是否为 Alert 消息
 */
export function isAlertMessage(msg: JsonMessage): msg is AlertJsonMessage {
  return msg.type === 'alert'
}

/**
 * 检查是否为 IoT 消息
 */
export function isIotMessage(msg: JsonMessage): msg is IotJsonMessage {
  return msg.type === 'iot'
}

/**
 * MQTT 配置信息
 */
export interface MqttInfo {
  endpoint: string
  client_id: string
  username: string
  password: string
  publish_topic: string
  subscribe_topic: string
}

/**
 * 网络配置
 */
export interface NetworkConfig {
  websocket_url?: string
  websocket_access_token?: string
  mqtt_endpoint?: string
  mqtt_client_id?: string
  mqtt_username?: string
  mqtt_password?: string
  mqtt_publish_topic?: string
  mqtt_subscribe_topic?: string
}

/**
 * 激活数据
 */
export interface ActivationData {
  challenge: string
  code: string
  message?: string
}
