/**
 * Analytics API
 * 为渲染进程提供埋点上报能力
 */
import { ipcRenderer } from 'electron'

export const analyticsApi = {
  /**
   * 上报事件
   * @param event - 事件名称
   * @param extra - 额外数据
   */
  track: async (event: string, extra?: Record<string, unknown>): Promise<{ success: boolean }> => {
    return await ipcRenderer.invoke('analytics:track', event, extra)
  },

  /**
   * 获取埋点配置
   */
  getConfig: async (): Promise<any> => {
    return await ipcRenderer.invoke('analytics:get-config')
  },

  /**
   * 更新埋点配置
   */
  updateConfig: async (config: any): Promise<{ success: boolean }> => {
    return await ipcRenderer.invoke('analytics:update-config', config)
  },

  /**
   * 手动触发发送
   */
  flush: async (): Promise<{ success: boolean }> => {
    return await ipcRenderer.invoke('analytics:flush')
  },
}
