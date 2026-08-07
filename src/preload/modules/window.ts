/**
 * 窗口控制 API 模块
 */
import type { IpcRendererEvent } from 'electron'
import { ipcRenderer } from 'electron'
import { assertIpcSuccess, unwrapIpcResult } from '../utils/ipc'

export type DisplayMode = 'main' | 'mini' | 'chat' | 'live2d' | 'pets'

export const windowApi = {
  // 面板控制
  togglePanel: (): void => ipcRenderer.send('panel:toggle'),
  toggleToMini: (): void => ipcRenderer.send('window:toggle-to-mini'),
  toggleToMain: (): void => ipcRenderer.send('window:toggle-to-main'),
  getDisplayMode: async (): Promise<DisplayMode> => {
    const result: unknown = await ipcRenderer.invoke('window:get-display-mode')
    return unwrapIpcResult<DisplayMode>(result, '获取显示模式失败')
  },
  switchDisplayMode: async (mode: DisplayMode): Promise<void> => {
    const result: unknown = await ipcRenderer.invoke('window:switch-display-mode', mode)
    assertIpcSuccess(result, '切换显示模式失败')
  },
  onDisplayModeChanged: (callback: (mode: DisplayMode) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, mode: DisplayMode) => {
      callback(mode)
    }
    ipcRenderer.on('window:display-mode-changed', handler)
    return () => ipcRenderer.off('window:display-mode-changed', handler)
  },

  // 激活窗口
  showActivation: (): void => ipcRenderer.send('activation:show'),

  // 设置窗口
  toggleSettings: (): void => ipcRenderer.send('window:toggle-settings'),

  // 退出应用
  quitApp: (): void => ipcRenderer.send('app:quit'),

  /** 统一 click-through：target 为桌宠窗口类型 */
  setClickThrough: (target: 'live2d' | 'pets', ignore: boolean): void =>
    ipcRenderer.send('window:set-click-through', target, ignore),

  // 原生全局坐标拖动（跨屏无偏移）
  dragStart: (): void => ipcRenderer.send('window:drag-start'),
  dragMove: (): void => ipcRenderer.send('window:drag-move'),
  dragEnd: (): void => ipcRenderer.send('window:drag-end'),

  // 窗口控制（用于无边框窗口 Win/Linux 自定义 UI）
  minimize: (): void => ipcRenderer.send('window:minimize'),
  maximize: (): void => ipcRenderer.send('window:maximize'),
  unmaximize: (): void => ipcRenderer.send('window:unmaximize'),
  toggleMaximize: (): void => ipcRenderer.send('window:toggle-maximize'),
  close: (): void => ipcRenderer.send('window:close'),
  openExternal: (url: string): void => ipcRenderer.send('window:open-external', url),

  /** 重启应用（写入 aec-boot 等后完整生效） */
  relaunchApp: async (): Promise<void> => {
    const result: unknown = await ipcRenderer.invoke('app:relaunch')
    assertIpcSuccess(result, '重启应用失败')
  },

  /**
   * 打开 macOS「录屏与系统录音」设置。
   * 非 darwin 返回 opened:false，不抛错。
   */
  openScreenRecordingSettings: async (): Promise<{ opened: boolean }> => {
    const result: unknown = await ipcRenderer.invoke('app:open-screen-recording-settings')
    return unwrapIpcResult<{ opened: boolean }>(result, '打开录屏设置失败')
  },
}
