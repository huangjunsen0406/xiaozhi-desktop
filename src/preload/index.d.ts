import type { ElectronAPI } from '@electron-toolkit/preload'
import type { Buffer } from 'node:buffer'

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
  activationInitialize: () => Promise<any>
  activationGetDeviceInfo: () => Promise<any>
  activationGetActivationData: () => Promise<any>
  activationStart: (data: any) => Promise<any>
  activationCancel: () => Promise<any>
  activationCheckStatus: () => Promise<any>
  // Audio APIs
  audioSendPCM: (pcm: Int16Array) => void
  audioOnOpusDecoded: (callback: (pcm: Buffer) => void) => void
  audioRemoveOpusDecodedListener: () => void
  // Audio Device APIs
  audioGetConfig: () => Promise<any>
  audioUpdateConfig: (config: any) => Promise<void>
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
  appSendTextViaAudio: (text: string) => Promise<void>
  appGetState: () => Promise<any>
  appOnStateChanged: (callback: (state: any) => void) => void
  appRemoveStateChangedListener: () => void
  appOnServerMessage: (callback: (message: any) => void) => void
  appRemoveServerMessageListener: () => void
  // System Config APIs
  systemGetConfig: () => Promise<any>
  systemUpdateConfig: (config: any) => Promise<any>
  // Wake Word APIs
  wakeWordGetConfig: () => Promise<{ success: boolean, data?: any, error?: string }>
  wakeWordUpdateConfig: (updates: any) => Promise<{ success: boolean, error?: string }>
  wakeWordTest: () => Promise<{ success: boolean, keyword?: string, error?: string }>
  // Background Audio Window APIs
  onAudioCommand: (callback: (command: string, data?: any) => void) => void
  sendAudioState: (state: any) => void
  backgroundAudioGetStatus: () => Promise<any>
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
  chatGetSessions: (limit?: number, offset?: number) => Promise<any[]>
  chatGetSession: (sessionId: string) => Promise<any>
  chatCreateSession: (data: { session_id: string, title?: string, started_at?: number }) => Promise<any>
  chatGetMessages: (sessionId: string, limit?: number, offset?: number) => Promise<any[]>
  chatAddMessage: (data: {
    session_id: string
    role: 'user' | 'assistant'
    content: string
    emotion?: string
    source_type: string
    image_data?: Uint8Array
    timestamp?: number
  }) => Promise<any>
  chatUpdateSessionTitle: (sessionId: string, title: string) => Promise<void>
  chatDeleteSession: (sessionId: string) => Promise<void>
  chatClearMessages: (sessionId: string) => Promise<void>
  chatOnImageCaptured: (callback: (data: { type: 'screenshot' | 'camera', imageBase64: string, timestamp: number }) => void) => void
  chatRemoveImageCapturedListener: () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: RendererApi
  }
}
