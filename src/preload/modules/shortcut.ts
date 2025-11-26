import { ipcRenderer } from 'electron'

export const shortcutApi = {
  /**
   * 获取所有快捷键配置
   */
  getAll: () => ipcRenderer.invoke('shortcut:get-all'),

  /**
   * 更新快捷键
   */
  update: (action: string, accelerator: string | null) =>
    ipcRenderer.invoke('shortcut:update', action, accelerator),

  /**
   * 检测快捷键冲突
   */
  checkConflict: (accelerator: string, excludeAction?: string) =>
    ipcRenderer.invoke('shortcut:check-conflict', accelerator, excludeAction),

  /**
   * 重置为默认快捷键
   */
  reset: () => ipcRenderer.invoke('shortcut:reset'),
}
