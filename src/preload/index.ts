import process from 'node:process'
import { electronAPI } from '@electron-toolkit/preload'
import { contextBridge, ipcRenderer } from 'electron'
// Custom APIs for renderer
const api = {
  togglePanel: (): void => ipcRenderer.send('panel:toggle'),
  toggleToMini: (): void => ipcRenderer.send('window:toggle-to-mini'),
  toggleToMain: (): void => ipcRenderer.send('window:toggle-to-main'),
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
