import type { ElectronAPI } from '@electron-toolkit/preload'

export interface RendererApi {
  togglePanel: () => void
  toggleToMini: () => void
  toggleToMain: () => void
  moveBy: (dx: number, dy: number) => void
  minimize: () => void
  maximize: () => void
  unmaximize: () => void
  toggleMaximize: () => void
  close: () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: RendererApi
  }
}
