/**
 * Camera Config API - 摄像头配置相关功能
 */
import type { CameraConfig } from '@shared/types'
import { ipcRenderer } from 'electron'

export type { CameraConfig }

export const cameraConfigApi = {
  /**
   * 获取摄像头配置
   */
  getConfig(): Promise<CameraConfig> {
    return ipcRenderer.invoke('camera-config:get')
  },

  /**
   * 更新摄像头配置
   */
  updateConfig(config: Partial<CameraConfig>): Promise<void> {
    return ipcRenderer.invoke('camera-config:update', config)
  },
}
