/**
 * 窗口控制 API 模块
 */
import { ipcRenderer } from 'electron'

export const windowApi = {
  // 面板控制
  togglePanel: (): void => ipcRenderer.send('panel:toggle'),
  toggleToMini: (): void => ipcRenderer.send('window:toggle-to-mini'),
  toggleToMain: (): void => ipcRenderer.send('window:toggle-to-main'),
  switchDisplayMode: (mode: 'main' | 'mini' | 'chat' | 'live2d' | 'pets'): Promise<void> => ipcRenderer.invoke('window:switch-display-mode', mode),

  // 激活窗口
  showActivation: (): void => ipcRenderer.send('activation:show'),

  // 设置窗口
  toggleSettings: (): void => ipcRenderer.send('window:toggle-settings'),

  /**
   * 桌宠窗点击穿透（live2d / pets 同一能力）
   * @deprecated 使用 setClickThrough('live2d', ignore)
   */
  setIgnoreMouseEvents: (ignore: boolean): void =>
    ipcRenderer.send('window:set-click-through', 'live2d', ignore),
  /**
   * @deprecated 使用 setClickThrough('pets', ignore)
   */
  setPetsIgnoreMouseEvents: (ignore: boolean): void =>
    ipcRenderer.send('window:set-click-through', 'pets', ignore),
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
}
