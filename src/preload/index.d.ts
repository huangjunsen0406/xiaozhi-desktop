import type { ElectronAPI } from '@electron-toolkit/preload'

export interface RendererApi {
  togglePanel: () => void
  toggleToMini: () => void
  toggleToMain: () => void
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
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: RendererApi
  }
}
