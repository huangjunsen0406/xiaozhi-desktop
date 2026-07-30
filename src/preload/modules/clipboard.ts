/**
 * 剪贴板 API
 */
import { ipcRenderer } from 'electron'
import { assertIpcSuccess, unwrapIpcResult } from '../utils/ipc'

export const clipboardApi = {
  /**
   * 复制文本到剪贴板
   */
  writeText: async (text: string): Promise<void> => {
    const result: unknown = await ipcRenderer.invoke('clipboard:writeText', text)
    assertIpcSuccess(result, '复制到剪贴板失败')
  },

  /**
   * 从剪贴板读取文本
   */
  readText: async (): Promise<string> => {
    const result: unknown = await ipcRenderer.invoke('clipboard:readText')
    return unwrapIpcResult<string>(result, '从剪贴板读取失败') ?? ''
  },
}
