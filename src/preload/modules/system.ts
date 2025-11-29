import type { IpcResult } from '@shared/types'
/**
 * 系统配置 API 模块
 */
import { ipcRenderer } from 'electron'

/**
 * 系统配置类型（网络配置的扩展）
 */
export interface SystemConfig {
  client_id: string
  device_id: string
  ota_version_url: string
  websocket_url: string
  websocket_access_token: string
  mqtt_endpoint: string
  mqtt_client_id: string
  mqtt_username: string
  mqtt_password: string
  mqtt_publish_topic: string
  mqtt_subscribe_topic: string
  activation_version: string
  authorization_url: string
}

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
