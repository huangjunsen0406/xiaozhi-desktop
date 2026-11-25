import type { DisplayMode } from '@shared/types'
import { ipcRenderer } from 'electron'
import { invokeData, invokeVoid, subscribeChannel } from '../utils/ipc'

export const windowApi = {
  togglePanel: (): void => ipcRenderer.send('panel:toggle'),
  toggleToMini: (): void => ipcRenderer.send('window:toggle-to-mini'),
  toggleToMain: (): void => ipcRenderer.send('window:toggle-to-main'),
  getDisplayMode: (): Promise<DisplayMode> =>
    invokeData('window:get-display-mode', '获取显示模式失败'),
  switchDisplayMode: (mode: DisplayMode): Promise<void> =>
    invokeVoid('window:switch-display-mode', '切换显示模式失败', mode),
  onDisplayModeChanged: (callback: (mode: DisplayMode) => void): (() => void) =>
    subscribeChannel('window:display-mode-changed', callback),

  showActivation: (): void => ipcRenderer.send('activation:show'),
  toggleSettings: (): void => ipcRenderer.send('window:toggle-settings'),
  quitApp: (): void => ipcRenderer.send('app:quit'),

  setClickThrough: (target: 'live2d' | 'pets', ignore: boolean): void =>
    ipcRenderer.send('window:set-click-through', target, ignore),

  dragStart: (): void => ipcRenderer.send('window:drag-start'),
  dragMove: (): void => ipcRenderer.send('window:drag-move'),
  dragEnd: (): void => ipcRenderer.send('window:drag-end'),

  minimize: (): void => ipcRenderer.send('window:minimize'),
  maximize: (): void => ipcRenderer.send('window:maximize'),
  unmaximize: (): void => ipcRenderer.send('window:unmaximize'),
  toggleMaximize: (): void => ipcRenderer.send('window:toggle-maximize'),
  close: (): void => ipcRenderer.send('window:close'),
  openExternal: (url: string): void => ipcRenderer.send('window:open-external', url),

  relaunchApp: (): Promise<void> =>
    invokeVoid('app:relaunch', '重启应用失败'),

  resetUserData: (): Promise<void> =>
    invokeVoid('app:reset-user-data', '清除本地配置失败'),

  openScreenRecordingSettings: (): Promise<{ opened: boolean }> =>
    invokeData('app:open-screen-recording-settings', '打开录屏设置失败'),
}
