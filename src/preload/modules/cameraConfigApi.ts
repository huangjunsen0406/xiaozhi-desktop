import type { CameraConfig } from '@shared/types'
import { invokeData, invokeVoid } from '../utils/ipc'

export const cameraConfigApi = {
  getConfig: (): Promise<CameraConfig> =>
    invokeData('camera-config:get', '获取摄像头配置失败'),

  updateConfig: (config: Partial<CameraConfig>): Promise<void> =>
    invokeVoid('camera-config:update', '更新摄像头配置失败', config),
}
