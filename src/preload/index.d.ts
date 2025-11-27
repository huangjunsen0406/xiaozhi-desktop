import type { ElectronAPI } from '@electron-toolkit/preload'
import type { Buffer } from 'node:buffer'

/**
 * 激活相关类型
 */
export interface ActivationDeviceInfo {
  serialNumber: string
  macAddress: string
  activationStatus: boolean
  deviceFingerprint: {
    system: string
    hostname: string
    mac_address: string
    machine_id: string
  }
}

export interface ActivationData {
  client_id: string
  otp: string
  mac_address: string
  code?: string
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
  message?: string
}

/**
 * 音频配置类型
 */
export interface AudioConfig {
  inputDeviceName?: string
  outputDeviceName?: string
  enableNoiseReduction: boolean
  enableEchoCancellation: boolean
  conversationMode: 'auto' | 'realtime'
}

/**
 * 应用状态类型（IPC 返回的原始格式，使用 snake_case）
 */
export interface AppStateSnapshotRaw {
  device_state: string
  listening_mode: string
  keep_listening: boolean
  audio_opened: boolean
}

/**
 * 应用状态类型（事件通知格式，使用 camelCase）
 */
export interface AppStateSnapshot {
  deviceState: string
  listeningMode: string
  channelOpen: boolean
}

/**
 * 服务器消息类型
 */
export interface ServerMessage {
  type: 'llm' | 'tts' | 'stt' | 'mcp'
  state?: 'start' | 'stop' | 'sentence_start' | 'sentence_end'
  text?: string
  emotion?: string
  payload?: {
    params?: {
      name?: string
      [key: string]: unknown
    }
    [key: string]: unknown
  }
  [key: string]: unknown
}

/**
 * 系统配置类型
 */
export interface SystemConfig {
  language?: string
  theme?: string
  autoStart?: boolean
  [key: string]: unknown
}

/**
 * 唤醒词配置类型
 */
export interface WakeWordConfig {
  enabled: boolean
  language: string
  keyword?: string
  sensitivity?: number
  threshold?: number
}

/**
 * 后台音频状态类型
 */
export interface BackgroundAudioStatus {
  initialized: boolean
  capturing: boolean
  inputDeviceId?: string
  outputDeviceId?: string
}

/**
 * 聊天会话类型
 */
export interface ChatSession {
  id: number
  session_id: string
  title?: string | null
  message_count: number
  started_at: number
  last_message_at?: number | null
}

/**
 * 聊天消息类型
 */
export interface ChatMessage {
  id: number
  session_id: string
  role: 'user' | 'assistant'
  content: string
  emotion?: string | null
  source_type: string
  image_data?: Uint8Array
  timestamp: number
}

export interface RendererApi {
  togglePanel: () => void
  toggleToMini: () => void
  toggleToMain: () => void
  switchDisplayMode: (mode: 'main' | 'mini' | 'chat') => Promise<void>
  showActivation: () => void
  toggleSettings: () => void
  dragStart: () => void
  dragMove: () => void
  dragEnd: () => void
  showHover: () => void
  hideHover: () => void
  repositionHover: () => void
  hoverMiniEnter: () => void
  hoverMiniLeave: () => void
  hoverWindowEnter: () => void
  hoverWindowLeave: () => void
  minimize: () => void
  maximize: () => void
  unmaximize: () => void
  toggleMaximize: () => void
  close: () => void
  openExternal: (string: string) => void
  // Activation APIs
  activationInitialize: () => Promise<{ success: boolean, error?: string }>
  activationGetDeviceInfo: () => Promise<ActivationDeviceInfo>
  activationGetActivationData: () => Promise<ActivationData>
  activationStart: (data: ActivationData) => Promise<ActivationResult>
  activationCancel: () => Promise<{ success: boolean, error?: string }>
  activationCheckStatus: () => Promise<ActivationStatus>
  // Audio APIs
  audioSendPCM: (pcm: Int16Array) => void
  audioOnOpusDecoded: (callback: (pcm: Buffer) => void) => void
  audioRemoveOpusDecodedListener: () => void
  // Audio Device APIs
  audioGetConfig: () => Promise<AudioConfig>
  audioUpdateConfig: (config: Partial<AudioConfig>) => Promise<void>
  audioGetDefaultDeviceId: (kind: 'input' | 'output') => Promise<string | null>
  // System Volume Control APIs
  audioSystemGetVolume: () => Promise<number>
  audioSystemSetVolume: (volume: number) => Promise<void>
  audioSystemVolumeSupported: () => Promise<boolean>
  // Application 控制 APIs
  appStartListeningManual: () => Promise<void>
  appStopListeningManual: () => Promise<void>
  appStartAutoConversation: () => Promise<void>
  appStopAutoConversation: () => Promise<void>
  appSendText: (text: string) => Promise<void>
  appGetState: () => Promise<AppStateSnapshotRaw>
  appOnStateChanged: (callback: (state: AppStateSnapshot) => void) => void
  appRemoveStateChangedListener: () => void
  appOnServerMessage: (callback: (message: ServerMessage) => void) => void
  appRemoveServerMessageListener: () => void
  // System Config APIs
  systemGetConfig: () => Promise<SystemConfig>
  systemUpdateConfig: (config: Partial<SystemConfig>) => Promise<{ success: boolean, error?: string }>
  // Wake Word APIs
  wakeWordGetConfig: () => Promise<{ success: boolean, data?: WakeWordConfig, error?: string }>
  wakeWordUpdateConfig: (updates: Partial<WakeWordConfig>) => Promise<{ success: boolean, error?: string }>
  wakeWordTest: () => Promise<{ success: boolean, keyword?: string, error?: string }>
  // Background Audio Window APIs
  onAudioCommand: (callback: (command: string, data?: Record<string, unknown>) => void) => void
  sendAudioState: (state: { initialized?: boolean, capturing?: boolean, error?: string }) => void
  backgroundAudioGetStatus: () => Promise<BackgroundAudioStatus>
  // Emotion APIs
  emotionSelectImage: () => Promise<Electron.OpenDialogReturnValue>
  emotionUploadCustom: (emotionType: string, sourcePath: string) => Promise<{ success: boolean, error?: string }>
  emotionGetMapping: () => Promise<Record<string, string>>
  emotionGetCustomPath: (emotionType: string) => Promise<string | null>
  emotionReset: (emotionType: string) => Promise<{ success: boolean, error?: string }>
  emotionOnChanged: (callback: (emotionType: string) => void) => void
  emotionRemoveChangedListener: () => void
  // Camera APIs
  cameraOnCaptureRequest: (callback: () => void) => () => void
  cameraSendCaptureResult: (success: boolean, data?: Uint8Array, message?: string) => void
  // Camera Config APIs
  cameraConfigGetConfig: () => Promise<{
    enabled: boolean
    deviceId: string
    deviceLabel: string
    useLocalVision: boolean
    vlApiKey: string
    vlUrl: string
    vlModel: string
    captureWidth: number
    captureHeight: number
    jpegQuality: number
    maxDimension: number
  }>
  cameraConfigUpdateConfig: (config: {
    enabled?: boolean
    deviceId?: string
    deviceLabel?: string
    useLocalVision?: boolean
    vlApiKey?: string
    vlUrl?: string
    vlModel?: string
    captureWidth?: number
    captureHeight?: number
    jpegQuality?: number
    maxDimension?: number
  }) => Promise<void>
  // Theme APIs
  themeOnChange: (callback: (theme: string) => void) => () => void
  themeGetCurrent: () => Promise<string>
  // Chat APIs
  chatGetSessions: (limit?: number, offset?: number) => Promise<ChatSession[]>
  chatGetSession: (sessionId: string) => Promise<ChatSession | null>
  chatCreateSession: (data: { session_id: string, title?: string, started_at?: number }) => Promise<ChatSession>
  chatGetMessages: (sessionId: string, limit?: number, offset?: number) => Promise<ChatMessage[]>
  chatAddMessage: (data: {
    session_id: string
    role: 'user' | 'assistant'
    content: string
    emotion?: string
    source_type: string
    image_data?: Uint8Array
    timestamp?: number
  }) => Promise<ChatMessage>
  chatUpdateSessionTitle: (sessionId: string, title: string) => Promise<void>
  chatDeleteSession: (sessionId: string) => Promise<void>
  chatClearMessages: (sessionId: string) => Promise<void>
  chatOnImageCaptured: (callback: (data: { type: 'screenshot' | 'camera', imageBase64: string, timestamp: number }) => void) => void
  chatRemoveImageCapturedListener: () => void
  chatOnMessageAdded: (callback: (data: { messageId: number, sessionId: string, role: 'user' | 'assistant', timestamp: number }) => void) => void
  chatRemoveMessageAddedListener: () => void
  chatOnMessagesBatchAdded: (callback: (data: { messageIds: number[], sessionId: string, timestamp: number }) => void) => void
  chatRemoveMessagesBatchAddedListener: () => void
  // Shortcut APIs
  shortcutGetAll: () => Promise<ShortcutConfig[]>
  shortcutUpdate: (action: string, accelerator: string | null) => Promise<{ success: boolean }>
  shortcutCheckConflict: (accelerator: string, excludeAction?: string) => Promise<{ conflict: boolean, name: string | null }>
  shortcutReset: () => Promise<{ success: boolean }>
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

declare global {
  interface Window {
    electron: ElectronAPI
    api: RendererApi
  }
}
