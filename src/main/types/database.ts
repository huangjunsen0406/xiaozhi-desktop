import type {
  AudioSettings,
  CameraConfig,
  IpcResult,
  MqttInfo,
  OtaConfigResponse,
  ServerMessage,
  WakeWordConfig,
} from '@shared/types'
/**
 * 数据库类型定义
 * 定义所有数据库表的类型接口
 */
import type { Buffer } from 'node:buffer'

export interface DbDeviceInfo {
  id: number
  mac_address: string
  serial_number: string
  hmac_key: string
  machine_id: string | null
  system: string | null
  hostname: string | null
  activation_status: number
  created_at: number
  updated_at: number
}

/**
 * 网络配置表类型
 */
export interface DbNetworkConfig {
  id: number
  client_id: string
  device_id: string | null
  ota_version_url: string
  activation_version: string
  authorization_url: string
  websocket_url: string | null
  websocket_access_token: string | null
  mqtt_endpoint: string | null
  mqtt_client_id: string | null
  mqtt_username: string | null
  mqtt_password: string | null
  mqtt_publish_topic: string | null
  mqtt_subscribe_topic: string | null
  created_at: number
  updated_at: number
}

/**
 * 音频配置表类型
 */
export interface DbAudioSettings {
  id: number
  input_device_name: string | null
  output_device_name: string | null
  enable_noise_reduction: number
  enable_echo_cancellation: number
  /** off | app | system；缺列时由 enable_echo_cancellation 推导 */
  aec_mode?: string | null
  conversation_mode: string
  // 音频参数配置
  input_sample_rate: number
  output_sample_rate: number
  channels: number
  frame_duration: number
  created_at: number
  updated_at: number
}

/**
 * 唤醒词配置表类型
 */
export interface DbWakeWordConfig {
  id: number
  enabled: number
  language: string
  keyword_zh: string
  keyword_en: string
  threshold: number
  score: number
  cooldown_ms: number
  created_at: number
  updated_at: number
}

/**
 * 摄像头配置表类型
 */
export interface DbCameraConfig {
  id: number
  enabled: number
  device_id: string
  device_label: string
  use_local_vision: number
  vl_api_key: string
  vl_url: string
  vl_model: string
  capture_width: number
  capture_height: number
  jpeg_quality: number
  max_dimension: number
  created_at: number
  updated_at: number
}

/**
 * 聊天会话表类型
 */
export interface DbChatSession {
  id: number
  session_id: string
  title: string | null
  message_count: number
  started_at: number
  last_message_at: number | null
  created_at: number
  /** 会话首条消息内容（会话列表摘要） */
  preview: string | null
}

/**
 * 聊天消息表类型
 */
export interface DbChatMessage {
  id: number
  session_id: string
  role: 'user' | 'assistant'
  content: string
  emotion: string | null
  source_type: string
  image_data: Buffer | null
  timestamp: number
  created_at: number
}

/**
 * 会话统计类型
 */
export interface DbSessionStats {
  count: number
  last_ts: number | null
}

/**
 * 音乐配置表类型
 */
export interface DbMusicConfig {
  id: number
  search_url: string
  url_api: string
  url_api_key: string
  url_response_path: string
  lyrics_url: string
  default_source: string
  default_quality: string
  created_at: number
  updated_at: number
}

/**
 * 快捷键配置表类型
 */
export interface DbShortcutConfig {
  id: number
  action: string
  name: string
  category: string
  accelerator: string | null
  enabled: number
  is_global: number
  created_at: number
  updated_at: number
}

// 导出共享类型
export type { IpcResult, MqttInfo, OtaConfigResponse, ServerMessage }

/**
 * 摄像头配置更新类型
 */
export type CameraConfigUpdate = Partial<CameraConfig>

/**
 * 唤醒词配置更新类型
 */
export type WakeWordConfigUpdate = Partial<WakeWordConfig>

/**
 * 音频配置更新类型
 */
export type AudioSettingsUpdate = Partial<AudioSettings>
