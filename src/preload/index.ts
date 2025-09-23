import process from 'node:process'
import { electronAPI } from '@electron-toolkit/preload'
import { contextBridge, ipcRenderer } from 'electron'
// Custom APIs for renderer
const api = {
  togglePanel: (): void => ipcRenderer.send('panel:toggle'),
  toggleToMini: (): void => ipcRenderer.send('window:toggle-to-mini'),
  toggleToMain: (): void => ipcRenderer.send('window:toggle-to-main'),
  moveBy: (dx: number, dy: number): void => ipcRenderer.send('window:move-by', dx, dy),
  resizeTo: (width: number, height?: number): void => ipcRenderer.send('window:resize-to', width, height),
  showHover: (): void => ipcRenderer.send('hover:show'),
  hideHover: (): void => ipcRenderer.send('hover:hide'),
  repositionHover: (): void => ipcRenderer.send('hover:reposition'),
  // cross-window hover handoff
  hoverMiniEnter: (): void => ipcRenderer.send('hover:mini-enter'),
  hoverMiniLeave: (): void => ipcRenderer.send('hover:mini-leave'),
  hoverWindowEnter: (): void => ipcRenderer.send('hover:hover-enter'),
  hoverWindowLeave: (): void => ipcRenderer.send('hover:hover-leave'),
  // Window controls for frameless windows (Win/Linux custom UI)
  minimize: (): void => ipcRenderer.send('window:minimize'),
  maximize: (): void => ipcRenderer.send('window:maximize'),
  unmaximize: (): void => ipcRenderer.send('window:unmaximize'),
  toggleMaximize: (): void => ipcRenderer.send('window:toggle-maximize'),
  close: (): void => ipcRenderer.send('window:close'),
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
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
