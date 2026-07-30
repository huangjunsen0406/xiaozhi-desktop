/**
 * Camera Config API - 摄像头配置相关功能
 */
import type { CameraConfig } from '@shared/types'
import { ipcRenderer } from 'electron'
import { assertIpcSuccess, unwrapIpcResult } from '../utils/ipc'

export type { CameraConfig }

export const cameraConfigApi = {
  /**
   * 获取摄像头配置
   */
  async getConfig(): Promise<CameraConfig> {
    const result: unknown = await ipcRenderer.invoke('camera-config:get')
    return unwrapIpcResult<CameraConfig>(result, '获取摄像头配置失败')
  },

  /**
   * 更新摄像头配置
   */
  async updateConfig(config: Partial<CameraConfig>): Promise<void> {
    const result: unknown = await ipcRenderer.invoke('camera-config:update', config)
    assertIpcSuccess(result, '更新摄像头配置失败')
  },
}
