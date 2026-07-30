import type { ElectronAPI } from '@electron-toolkit/preload'
import type {
  ActivationData,
  ActivationResult,
  ActivationStatus,
  AppStateSnapshot,
  AudioConfig,
  BackgroundAudioStateUpdate,
  BackgroundAudioStatus,
  CameraConfig,
  ChatMessage,
  ChatSession,
  DeviceInfo,
  McpPluginImportResult,
  McpToolCatalogItem,
  McpToolsSaveResult,
  ModelInfo,
  MusicConfig,
  PetInfo,
  ServerMessage,
  ShortcutConfig,
  SystemConfig,
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
  AudioConfig,
  BackgroundAudioStateUpdate,
  BackgroundAudioStatus,
  CameraConfig,
  ChatMessage,
  ChatSession,
  DeviceInfo,
  McpPluginImportResult,
  McpToolCatalogItem,
  McpToolsSaveResult,
  ModelInfo,
  MusicConfig,
  PetInfo,
  ServerMessage,
  ShortcutConfig,
  SystemConfig,
  WakeWordConfig,
}

export interface RendererApi {
  togglePanel: () => void
  toggleToMini: () => void
  toggleToMain: () => void
  switchDisplayMode: (mode: 'main' | 'mini' | 'chat' | 'live2d' | 'pets') => Promise<void>
  showActivation: () => void
  toggleSettings: () => void
  setIgnoreMouseEvents: (ignore: boolean) => void
  setPetsIgnoreMouseEvents: (ignore: boolean) => void
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
  audioOnOpusDecoded: (callback: (pcm: Buffer) => void) => () => void
  // Audio Device APIs
  audioGetConfig: () => Promise<AudioConfig>
  audioUpdateConfig: (config: Partial<AudioConfig>) => Promise<{
    requiresRelaunch?: boolean
    aecMode?: AudioConfig['aecMode']
    aecStatus?: import('@shared/types').AecStatus
    deviceSwitched?: boolean
    captureReinitialized?: boolean
    codecRebuilt?: boolean
    protocolReconnected?: boolean
    applied?: {
      devicesChanged?: boolean
      codecParamsChanged?: boolean
      processingChanged?: boolean
      conversationModeChanged?: boolean
      audioWindowAction?: 'none' | 'switchDevices' | 'reinitialize'
    }
  } | void>
  audioGetAecStatus: () => Promise<import('@shared/types').AecStatus>
  audioReportAecCapture: (payload: { echoCancellationApplied?: boolean }) => Promise<import('@shared/types').AecStatus>
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
  appGetState: () => Promise<AppStateSnapshot>
  appOnStateChanged: (callback: (state: AppStateSnapshot) => void) => () => void
  appOnServerMessage: (callback: (message: ServerMessage) => void) => () => void
  // System Config APIs
  systemGetConfig: () => Promise<SystemConfig>
  systemUpdateConfig: (config: SystemConfig) => Promise<void>
  // Wake Word APIs
  wakeWordGetConfig: () => Promise<WakeWordConfig>
  wakeWordUpdateConfig: (updates: Partial<WakeWordConfig>) => Promise<void>
  wakeWordTest: () => Promise<string | undefined>
  // Background Audio Window APIs
  onAudioCommand: (callback: (command: string, data?: Record<string, unknown>) => void) => () => void
  sendAudioState: (state: BackgroundAudioStateUpdate) => void
  backgroundAudioGetStatus: () => Promise<BackgroundAudioStatus>
  // Emotion APIs
  emotionSelectImage: () => Promise<Electron.OpenDialogReturnValue>
  emotionUploadCustom: (emotionType: string, sourcePath: string) => Promise<void>
  emotionGetMapping: () => Promise<Record<string, string>>
  emotionGetCustomPath: (emotionType: string) => Promise<string | null>
  emotionReset: (emotionType: string) => Promise<void>
  emotionOnChanged: (callback: (emotionType: string) => void) => () => void
  // Camera APIs
  cameraOnCaptureRequest: (callback: () => void) => () => void
  cameraSendCaptureResult: (success: boolean, data?: Uint8Array, message?: string) => void
  // Camera Config APIs
  cameraConfigGetConfig: () => Promise<CameraConfig>
  cameraConfigUpdateConfig: (config: Partial<CameraConfig>) => Promise<void>
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
    sourceType: string
    image_data?: Uint8Array
    timestamp?: number
  }) => Promise<ChatMessage>
  chatUpdateSessionTitle: (sessionId: string, title: string) => Promise<void>
  chatDeleteSession: (sessionId: string) => Promise<void>
  chatClearMessages: (sessionId: string) => Promise<void>
  chatOnImageCaptured: (callback: (data: { type: 'screenshot' | 'camera', imageBase64: string, timestamp: number }) => void) => () => void
  chatOnMessageAdded: (callback: (data: { messageId: number, sessionId: string, role: 'user' | 'assistant', timestamp: number }) => void) => () => void
  chatOnMessagesBatchAdded: (callback: (data: { messageIds: number[], sessionId: string, timestamp: number }) => void) => () => void
  chatOnSessionCreated: (callback: (data: { sessionId: string, timestamp: number }) => void) => () => void
  // Shortcut APIs
  shortcutGetAll: () => Promise<ShortcutConfig[]>
  shortcutUpdate: (action: string, accelerator: string | null) => Promise<void>
  shortcutCheckConflict: (accelerator: string, excludeAction?: string) => Promise<{ conflict: boolean, name: string | null }>
  shortcutReset: () => Promise<void>
  // Music APIs
  musicOnCommand: (callback: (message: { command: string, args?: Record<string, unknown> }) => void) => () => void
  musicStatusUpdate: (status: Record<string, unknown>) => void
  musicGetConfig: () => Promise<MusicConfig>
  musicUpdateConfig: (config: Partial<MusicConfig>) => Promise<void>

  // Live2D APIs
  live2dOnAudioVolume: (callback: (volume: number) => void) => () => void

  // Model APIs
  modelGetList: () => Promise<ModelInfo[]>
  modelGetCurrent: () => Promise<string>
  modelSetCurrent: (modelId: string) => Promise<void>
  modelSelectFolder: () => Promise<Electron.OpenDialogReturnValue>
  modelImport: (sourcePath: string) => Promise<string | undefined>
  modelDelete: (modelId: string) => Promise<void>
  modelOpenFolder: () => Promise<void>
  modelGetFolderPath: () => Promise<string>
  modelOnChanged: (callback: (modelId: string) => void) => () => void

  // Pets APIs
  petsGetList: () => Promise<PetInfo[]>
  petsGetCurrent: () => Promise<string>
  petsSetCurrent: (petId: string) => Promise<void>
  petsSelectFolder: () => Promise<Electron.OpenDialogReturnValue>
  petsImport: (sourcePath: string) => Promise<string | undefined>
  petsDelete: (petId: string) => Promise<void>
  petsGetFolderPath: () => Promise<string>
  petsGetSpritesheet: (petId: string) => Promise<string | null>
  petsOpenFolder: () => Promise<void>
  petsOnChanged: (callback: (petId: string) => void) => () => void

  // MCP 工具 APIs
  mcpToolsGetCatalog: () => Promise<McpToolCatalogItem[]>
  mcpToolsGetDisabled: () => Promise<string[]>
  mcpToolsSaveDisabled: (disabledNames: string[]) => Promise<McpToolsSaveResult>
  mcpToolsSelectFolder: () => Promise<Electron.OpenDialogReturnValue>
  mcpToolsImportPlugin: (sourcePath: string) => Promise<McpPluginImportResult>
  mcpToolsOpenFolder: () => Promise<void>
  mcpToolsGetFolderPath: () => Promise<string>
  mcpToolsRefresh: () => Promise<McpToolCatalogItem[]>
  /** 删除已导入外挂，返回最新 catalog */
  mcpToolsDeletePlugin: (pluginId: string) => Promise<McpToolCatalogItem[]>

  // 剪贴板 API
  clipboardWriteText: (text: string) => Promise<void>
  clipboardReadText: () => Promise<string | null>
}

// ShortcutConfig 从共享类型导入

declare global {
  interface Window {
    electron: ElectronAPI
    api: RendererApi
  }
}
