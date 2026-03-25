import type { IpcResult, WakeWordConfig } from '@shared/types'
import { ipcRenderer } from 'electron'
import { assertIpcSuccess, unwrapIpcResult } from '../utils/ipc'

// 导出共享类型
export type { WakeWordConfig }

/**
 * 唤醒词 API
 */
export const wakeWordApi = {
  /**
   * 获取唤醒词配置
   */
  getConfig: async (): Promise<WakeWordConfig> => {
    const result = await ipcRenderer.invoke('wake-word:get-config') as IpcResult<WakeWordConfig> | WakeWordConfig
    return unwrapIpcResult(result, '获取唤醒词配置失败')
  },

  /**
   * 更新唤醒词配置
   */
  updateConfig: async (updates: Partial<WakeWordConfig>): Promise<void> => {
    const result = await ipcRenderer.invoke('wake-word:update-config', updates) as { success: boolean, error?: string }
    assertIpcSuccess(result, '更新唤醒词配置失败')
  },

  /**
   * 测试唤醒词（模拟触发）
   */
  test: async (): Promise<string | undefined> => {
    const result = await ipcRenderer.invoke('wake-word:test') as { success: boolean, keyword?: string, error?: string }
    assertIpcSuccess(result, '测试唤醒词失败')
    return result.keyword
  },
}
