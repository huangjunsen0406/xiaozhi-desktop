import type { WakeWordConfig } from '@shared/types'
import { ipcRenderer } from 'electron'
import { assertIpcSuccess, unwrapIpcResult, unwrapIpcSuccessFields } from '../utils/ipc'

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
    const result: unknown = await ipcRenderer.invoke('wake-word:get-config')
    return unwrapIpcResult(result, '获取唤醒词配置失败')
  },

  /**
   * 更新唤醒词配置
   */
  updateConfig: async (updates: Partial<WakeWordConfig>): Promise<void> => {
    const result: unknown = await ipcRenderer.invoke('wake-word:update-config', updates)
    assertIpcSuccess(result, '更新唤醒词配置失败')
  },

  /**
   * 测试唤醒词（模拟触发）
   * 特殊 shape：`{ success, keyword?, error? }`（keyword 在顶层，非 data）
   */
  test: async (): Promise<string | undefined> => {
    const result: unknown = await ipcRenderer.invoke('wake-word:test')
    const data = unwrapIpcSuccessFields<{ success: true, keyword?: string }>(
      result,
      '测试唤醒词失败',
    )
    return data.keyword
  },
}
