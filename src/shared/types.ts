export interface IpcResultSuccess<T = unknown> {
  success: true
  data: T
}

export interface IpcResultError {
  success: false
  error: string
}

export type IpcResult<T = unknown> = IpcResultSuccess<T> | IpcResultError

export interface DeviceFingerprint {
  system: string
  hostname: string
  mac_address: string
  machine_id: string
}

export interface DeviceInfo {
  serialNumber: string
  macAddress: string
  activationStatus: boolean
  deviceFingerprint?: DeviceFingerprint
}

export interface ActivationData {
  client_id?: string
  otp?: string
  mac_address?: string
  challenge?: string
  code?: string
  message?: string
}

export interface ActivationResult {
  success: boolean
  message?: string
  websocket_url?: string
  access_token?: string
  error?: string
}

export interface ActivationStatus {
  activated: boolean
  isActivated?: boolean
  message?: string
}

export interface ActivationInitResult {
  success: boolean
  need_activation_ui: boolean
  error?: string
}

export interface AudioDeviceInfo {
  deviceId: string
  groupId: string
  kind: 'audioinput' | 'audiooutput'
  label: string
}

export interface AudioConfig {
  inputDeviceName?: string
  outputDeviceName?: string
  microphoneVolume?: number
  speakerVolume?: number
  enableNoiseReduction?: boolean
  enableEchoCancellation?: boolean
  conversationMode?: 'realtime' | 'auto'
  // 高级音频参数
  inputSampleRate?: number
  outputSampleRate?: number
  channels?: number
  maxInputChannels?: number
  maxOutputChannels?: number
  frameDuration?: number
}

export interface AudioDeviceList {
  inputs: AudioDeviceInfo[]
  outputs: AudioDeviceInfo[]
}

export interface AudioListener {
  readonly name: string
  onAudioData: (pcmData: Int16Array) => void
}

export interface BackgroundAudioStatus {
  initialized: boolean
  capturing: boolean
  playing?: boolean
  inputDeviceId?: string
  outputDeviceId?: string
  currentInputDeviceId?: string
  currentOutputDeviceId?: string
  error?: string
}

export interface SystemConfig {
  client_id: string
  device_id: string
  ota_version_url: string
  websocket_url: string
  websocket_access_token: string
  mqtt_endpoint: string
  mqtt_client_id: string
  mqtt_username: string
  mqtt_password: string
  mqtt_publish_topic: string
  mqtt_subscribe_topic: string
  activation_version: string
  authorization_url: string
}

export type DeviceState = 'idle' | 'connecting' | 'listening' | 'speaking'

export type ListeningMode = 'auto' | 'manual' | 'realtime'

export interface AppStateSnapshotRaw {
  device_state: string
  listening_mode: string
  keep_listening: boolean
  audio_opened: boolean
}

export interface AppStateSnapshot {
  deviceState: string
  listeningMode: string
  channelOpen: boolean
  keepListening?: boolean
  audioOpened?: boolean
}

export interface ServerMessage {
  type: 'llm' | 'tts' | 'stt' | 'mcp' | 'iot' | 'alert' | 'listen' | 'abort' | string
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

export interface WakeWordConfig {
  enabled: boolean
  language: string
  keyword?: string
  keyword_zh?: string
  keyword_en?: string
  keywords_list?: string
  sensitivity?: number
  threshold?: number
  score?: number
  cooldown_ms?: number
}

export interface CameraConfig {
  enabled: boolean
  deviceId: string
  device_id?: string
  deviceLabel: string
  device_label?: string
  useLocalVision: boolean
  use_local_vision?: boolean
  vlApiKey: string
  vl_api_key?: string
  vlUrl: string
  vl_url?: string
  vlModel: string
  vl_model?: string
  captureWidth: number
  capture_width?: number
  captureHeight: number
  capture_height?: number
  jpegQuality: number
  jpeg_quality?: number
  maxDimension: number
  max_dimension?: number
}

export interface MqttInfo {
  endpoint: string | null
  client_id: string | null
  username: string | null
  password: string | null
  publish_topic: string | null
  subscribe_topic: string | null
}

export interface NetworkConfig {
  websocket_url?: string | null
  websocket_access_token?: string | null
  mqtt_endpoint?: string | null
  mqtt_client_id?: string | null
  mqtt_username?: string | null
  mqtt_password?: string | null
  mqtt_publish_topic?: string | null
  mqtt_subscribe_topic?: string | null
}

export interface ShortcutConfig {
  id: number
  action: string
  name: string
  category: string
  accelerator: string | null
  enabled: number
  is_global: number
}

export interface OtaConfigResponse {
  websocket?: {
    url?: string
    token?: string
  }
  mqtt?: {
    endpoint?: string
    client_id?: string
    username?: string
    password?: string
    publish_topic?: string
    subscribe_topic?: string
  }
  activation?: {
    challenge: string
    code: string
    message?: string
  }
}
