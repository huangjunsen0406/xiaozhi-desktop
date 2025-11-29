import type { WakeWordConfig } from '@shared/types'
import { ipcRenderer } from 'electron'

// 导出共享类型
export type { WakeWordConfig }

/**
 * 唤醒词 API
 */
export const wakeWordApi = {
  /**
   * 获取唤醒词配置
   */
  getConfig: async (): Promise<{ success: boolean, data?: WakeWordConfig, error?: string }> => {
    return await ipcRenderer.invoke('wake-word:get-config')
  },

  /**
   * 更新唤醒词配置
   */
  updateConfig: async (updates: Partial<WakeWordConfig>): Promise<{ success: boolean, error?: string }> => {
    return await ipcRenderer.invoke('wake-word:update-config', updates)
  },

  /**
   * 测试唤醒词（模拟触发）
   */
  test: async (): Promise<{ success: boolean, keyword?: string, error?: string }> => {
    return await ipcRenderer.invoke('wake-word:test')
  },
}
