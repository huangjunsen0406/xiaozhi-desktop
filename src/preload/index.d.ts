import type { ElectronAPI } from '@electron-toolkit/preload'
import type { Buffer } from 'node:buffer'

export interface RendererApi {
  togglePanel: () => void
  toggleToMini: () => void
  toggleToMain: () => void
  switchDisplayMode: (mode: 'main' | 'mini') => Promise<void>
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
  appGetState: () => Promise<any>
  appOnStateChanged: (callback: (state: any) => void) => void
  // Background Audio Window APIs
  onAudioCommand: (callback: (command: string, data?: any) => void) => void
  sendAudioState: (state: any) => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: RendererApi
  }
}
