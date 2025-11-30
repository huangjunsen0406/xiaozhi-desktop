/**
 * Logger API - 渲染进程日志转发到主进程
 */
import { ipcRenderer } from 'electron'

export const loggerApi = {
  /**
   * 发送日志到主进程
   */
  logToMain: (log: {
    level: 'info' | 'warn' | 'error'
    source: string
    message: string
    timestamp: string
  }): Promise<void> => {
    return ipcRenderer.invoke('logger:log-to-main', log)
  },
}
