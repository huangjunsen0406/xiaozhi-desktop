/**
 * Analytics IPC 通道
 * 为渲染进程提供埋点上报能力
 */

import { ipcMain } from 'electron'
import { getAnalyticsService } from '../services/AnalyticsService'

export function registerAnalyticsIpcChannels(): void {
  /**
   * 上报事件
   */
  ipcMain.handle('analytics:track', async (_event, eventName: string, extra?: Record<string, unknown>) => {
    try {
      const analytics = getAnalyticsService()
      analytics.track(eventName, extra)
      return { success: true }
    } catch (error) {
      console.error('analytics:track error:', error)
      return { success: false, error: String(error) }
    }
  })

  /**
   * 获取配置
   */
  ipcMain.handle('analytics:get-config', async () => {
    try {
      const analytics = getAnalyticsService()
      return { success: true, config: analytics.getConfig() }
    } catch (error) {
      console.error('analytics:get-config error:', error)
      return { success: false, error: String(error) }
    }
  })

  /**
   * 更新配置
   */
  ipcMain.handle('analytics:update-config', async (_event, config: any) => {
    try {
      const analytics = getAnalyticsService()
      analytics.updateConfig(config)
      return { success: true }
    } catch (error) {
      console.error('analytics:update-config error:', error)
      return { success: false, error: String(error) }
    }
  })

  /**
   * 手动触发发送
   */
  ipcMain.handle('analytics:flush', async () => {
    try {
      const analytics = getAnalyticsService()
      await analytics.flush()
      return { success: true }
    } catch (error) {
      console.error('analytics:flush error:', error)
      return { success: false, error: String(error) }
    }
  })
}
