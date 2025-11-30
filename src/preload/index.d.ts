import type { ElectronAPI } from '@electron-toolkit/preload'
import type {
  ActivationData,
  ActivationResult,
  ActivationStatus,
  AppStateSnapshot,
  AppStateSnapshotRaw,
  AudioConfig,
  BackgroundAudioStatus,
  ChatMessage,
  ChatSession,
  DeviceInfo,
  ServerMessage,
  ShortcutConfig,
  WakeWordConfig,
} from '@shared/types'
import type { Buffer } from 'node:buffer'

/**
 * 激活设备信息
 */
export type ActivationDeviceInfo = DeviceInfo

// 导出共享类型供渲染进程使用
export type {
  ActivationData,
  ActivationResult,
  ActivationStatus,
  AppStateSnapshot,
  AppStateSnapshotRaw,
  AudioConfig,
  BackgroundAudioStatus,
  ChatMessage,
  ChatSession,
  DeviceInfo,
  ServerMessage,
  ShortcutConfig,
  WakeWordConfig,
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

export interface RendererApi {
  togglePanel: () => void
  toggleToMini: () => void
  toggleToMain: () => void
  switchDisplayMode: (mode: 'main' | 'mini' | 'chat' | 'live2d') => Promise<void>
  showActivation: () => void
  toggleSettings: () => void
  setIgnoreMouseEvents: (ignore: boolean) => void
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
  activationGetActivationData: () => Promise<ActivationData | null>
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
  chatOnSessionCreated: (callback: (data: { sessionId: string, timestamp: number }) => void) => void
  chatRemoveSessionCreatedListener: () => void
  // Shortcut APIs
  shortcutGetAll: () => Promise<ShortcutConfig[]>
  shortcutUpdate: (action: string, accelerator: string | null) => Promise<{ success: boolean }>
  shortcutCheckConflict: (accelerator: string, excludeAction?: string) => Promise<{ conflict: boolean, name: string | null }>
  shortcutReset: () => Promise<{ success: boolean }>
  // Music APIs
  musicOnCommand: (callback: (message: { command: string, args?: Record<string, unknown> }) => void) => void
  musicStatusUpdate: (status: Record<string, unknown>) => void

  // Live2D APIs
  live2dOnAudioVolume: (callback: (volume: number) => void) => void
  live2dRemoveAudioVolumeListener: () => void

  // Analytics APIs
  analyticsTrack: (event: string, extra?: Record<string, unknown>) => Promise<{ success: boolean }>
  analyticsGetConfig: () => Promise<any>
  analyticsUpdateConfig: (config: any) => Promise<{ success: boolean }>
  analyticsFlush: () => Promise<{ success: boolean }>
}

// ShortcutConfig 从共享类型导入

declare global {
  interface Window {
    electron: ElectronAPI
    api: RendererApi
  }
}
