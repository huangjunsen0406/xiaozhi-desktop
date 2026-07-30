import type { SystemConfig } from '@shared/types'
/**
 * 系统配置 API 模块
 */
import { ipcRenderer } from 'electron'
import { unwrapIpcResult } from '../utils/ipc'

export const systemApi = {
  // 获取系统配置
  getConfig: async (): Promise<SystemConfig> => {
    const result: unknown = await ipcRenderer.invoke('config:get-all')
    return unwrapIpcResult<SystemConfig>(result, '获取系统配置失败')
  },

  // 更新系统配置
  updateConfig: async (config: SystemConfig): Promise<void> => {
    const result: unknown = await ipcRenderer.invoke('config:update-all', config)
    unwrapIpcResult(result, '更新系统配置失败')
  },
}
