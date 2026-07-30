import { ipcRenderer } from 'electron'
import { assertIpcSuccess, unwrapIpcResult } from '../utils/ipc'

export const shortcutApi = {
  /**
   * 获取所有快捷键配置
   */
  getAll: async () => {
    const result: unknown = await ipcRenderer.invoke('shortcut:get-all')
    return unwrapIpcResult(result, '获取快捷键配置失败')
  },

  /**
   * 更新快捷键
   */
  update: async (action: string, accelerator: string | null): Promise<void> => {
    const result: unknown = await ipcRenderer.invoke('shortcut:update', action, accelerator)
    assertIpcSuccess(result, '更新快捷键失败')
  },

  /**
   * 检测快捷键冲突
   */
  checkConflict: async (accelerator: string, excludeAction?: string) => {
    const result: unknown = await ipcRenderer.invoke('shortcut:check-conflict', accelerator, excludeAction)
    return unwrapIpcResult<{ conflict: boolean, name: string | null | undefined }>(
      result,
      '检测快捷键冲突失败',
    )
  },

  /**
   * 重置为默认快捷键
   */
  reset: async (): Promise<void> => {
    const result: unknown = await ipcRenderer.invoke('shortcut:reset')
    assertIpcSuccess(result, '重置快捷键失败')
  },
}
