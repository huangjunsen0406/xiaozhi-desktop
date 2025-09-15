import type { ElectronAPI } from '@electron-toolkit/preload'

export interface RendererApi {
  togglePanel: () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: RendererApi
  }
}
