import type { IpcResult, SystemConfig } from '@shared/types'
/**
 * 系统配置 API 模块
 */
import { ipcRenderer } from 'electron'

// 配置操作结果使用共享的 IpcResult
export type ConfigResult<T = unknown> = IpcResult<T>

export const systemApi = {
  // 获取系统配置
  getConfig: (): Promise<ConfigResult<SystemConfig>> =>
    ipcRenderer.invoke('config:get-all'),

  // 更新系统配置
  updateConfig: (config: SystemConfig): Promise<ConfigResult<void>> =>
    ipcRenderer.invoke('config:update-all', config),
}
