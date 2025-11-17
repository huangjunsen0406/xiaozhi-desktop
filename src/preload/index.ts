import type { Buffer } from 'node:buffer'
import { electronAPI } from '@electron-toolkit/preload'
import { contextBridge, ipcRenderer } from 'electron'
// Custom APIs for renderer
const api = {
  togglePanel: (): void => ipcRenderer.send('panel:toggle'),
  toggleToMini: (): void => ipcRenderer.send('window:toggle-to-mini'),
  toggleToMain: (): void => ipcRenderer.send('window:toggle-to-main'),
  switchDisplayMode: (mode: 'main' | 'mini'): Promise<void> => ipcRenderer.invoke('window:switch-display-mode', mode),
  showActivation: (): void => ipcRenderer.send('activation:show'),
  toggleSettings: (): void => ipcRenderer.send('window:toggle-settings'),
  // 原生全局坐标拖动（跨屏无偏移）
  dragStart: (): void => ipcRenderer.send('window:drag-start'),
  dragMove: (): void => ipcRenderer.send('window:drag-move'),
  dragEnd: (): void => ipcRenderer.send('window:drag-end'),
  // Hover domain (all via single action channel)
  showHover: (): void => ipcRenderer.send('hover:action', { type: 'show' }),
  hideHover: (): void => ipcRenderer.send('hover:action', { type: 'hide' }),
  repositionHover: (): void => ipcRenderer.send('hover:action', { type: 'reposition' }),
  // cross-window hover handoff
  hoverMiniEnter: (): void => ipcRenderer.send('hover:action', { type: 'mini-enter' }),
  hoverMiniLeave: (): void => ipcRenderer.send('hover:action', { type: 'mini-leave' }),
  hoverWindowEnter: (): void => ipcRenderer.send('hover:action', { type: 'hover-enter' }),
  hoverWindowLeave: (): void => ipcRenderer.send('hover:action', { type: 'hover-leave' }),
  // Window controls for frameless windows (Win/Linux custom UI)
  minimize: (): void => ipcRenderer.send('window:minimize'),
  maximize: (): void => ipcRenderer.send('window:maximize'),
  unmaximize: (): void => ipcRenderer.send('window:unmaximize'),
  toggleMaximize: (): void => ipcRenderer.send('window:toggle-maximize'),
  close: (): void => ipcRenderer.send('window:close'),
  openExternal: (string: string): void => ipcRenderer.send('window:open-external', string),
  // Activation APIs
  activationInitialize: (): Promise<any> => ipcRenderer.invoke('activation:initialize'),
  activationGetDeviceInfo: (): Promise<any> => ipcRenderer.invoke('activation:get-device-info'),
  activationGetActivationData: (): Promise<any> => ipcRenderer.invoke('activation:get-activation-data'),
  activationStart: (data: any): Promise<any> => ipcRenderer.invoke('activation:start', data),
  activationCancel: (): Promise<any> => ipcRenderer.invoke('activation:cancel'),
  activationCheckStatus: (): Promise<any> => ipcRenderer.invoke('activation:check-status'),
  // Audio APIs
  audioSendPCM: (pcm: Int16Array): void => ipcRenderer.send('audio:pcm', pcm),
  audioOnOpusDecoded: (callback: (pcm: Buffer) => void): void => {
    ipcRenderer.on('audio:opus-decoded', (_, pcm) => callback(pcm))
  },
  audioRemoveOpusDecodedListener: (): void => {
    ipcRenderer.removeAllListeners('audio:opus-decoded')
  },
  // Audio Device APIs
  audioGetConfig: (): Promise<any> => ipcRenderer.invoke('audio:get-config'),
  audioUpdateConfig: (config: any): Promise<void> => ipcRenderer.invoke('audio:update-config', config),
  audioGetDefaultDeviceId: (kind: 'input' | 'output'): Promise<string | null> =>
    ipcRenderer.invoke('audio:get-default-device-id', kind),
  // Application 控制 APIs
  appStartListeningManual: (): Promise<void> => ipcRenderer.invoke('app:start-listening-manual'),
  appStopListeningManual: (): Promise<void> => ipcRenderer.invoke('app:stop-listening-manual'),
  appStartAutoConversation: (): Promise<void> => ipcRenderer.invoke('app:start-auto-conversation'),
  appStopAutoConversation: (): Promise<void> => ipcRenderer.invoke('app:stop-auto-conversation'),
  appGetState: (): Promise<any> => ipcRenderer.invoke('app:get-state'),
  appOnStateChanged: (callback: (state: any) => void): void => {
    ipcRenderer.on('app:state-changed', (_, state) => callback(state))
  },
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
// eslint-disable-next-line node/prefer-global/process
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  }
  catch (error) {
    console.error(error)
  }
}
else {
  // @ts-expect-error (define in dts)
  window.electron = electronAPI
  // @ts-expect-error (define in dts)
  window.api = api
}
