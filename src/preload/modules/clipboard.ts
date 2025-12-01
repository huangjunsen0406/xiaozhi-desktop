/**
 * 剪贴板 API
 */
import { ipcRenderer } from 'electron'

export const clipboardApi = {
  /**
   * 复制文本到剪贴板
   */
  writeText: (text: string): Promise<void> => {
    return ipcRenderer.invoke('clipboard:writeText', text)
  },

  /**
   * 从剪贴板读取文本
   */
  readText: (): Promise<string> => {
    return ipcRenderer.invoke('clipboard:readText')
  },
}
