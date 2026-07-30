/**
 * 主题 API
 * 用于主进程和渲染进程之间的主题切换通信
 */
import { ipcRenderer } from 'electron'
import { unwrapIpcResult } from '../utils/ipc'

export const themeApi = {
  /**
   * 监听主题变更事件
   * @param callback - 主题变更回调函数
   * @returns 移除监听器的函数
   */
  onThemeChange: (callback: (theme: string) => void) => {
    const listener = (_event: unknown, theme: string) => callback(theme)
    ipcRenderer.on('theme:set', listener)
    return () => ipcRenderer.removeListener('theme:set', listener)
  },

  /**
   * 请求当前主题（渲染进程主动查询）
   * @returns 当前主题 ('light' | 'dark' | 'auto')
   */
  getCurrentTheme: async (): Promise<string> => {
    const result: unknown = await ipcRenderer.invoke('theme:get')
    return unwrapIpcResult<string>(result, '获取主题失败') ?? 'auto'
  },
}
