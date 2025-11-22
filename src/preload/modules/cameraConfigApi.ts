/**
 * Camera Config API - 摄像头配置相关功能
 */
import { ipcRenderer } from 'electron'

export interface CameraConfig {
  enabled: boolean
  deviceId: string
  deviceLabel: string
  useLocalVision: boolean
  vlApiKey: string
  vlUrl: string
  vlModel: string
  captureWidth: number
  captureHeight: number
  jpegQuality: number
  maxDimension: number
}

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
