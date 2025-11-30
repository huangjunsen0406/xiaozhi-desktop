/**
 * 摄像头配置 IPC 处理
 */
import { ipcMain } from 'electron'
import { DatabaseManager } from '../services/database'
import { createLogger } from '../utils/logger'

const logger = createLogger('CameraConfigIpc')

export function registerCameraConfigIpc(): void {
  const db = DatabaseManager.getInstance()

  /**
   * 获取摄像头配置
   */
  ipcMain.handle('camera-config:get', async () => {
    try {
      const config = db.getFormattedCameraConfig()
      logger.info('获取配置:', config)
      return config
    }
    catch (error) {
      logger.error('获取配置失败:', error)
      throw error
    }
  })

  /**
   * 更新摄像头配置
   */
  ipcMain.handle('camera-config:update', async (_event, updates: {
    enabled?: boolean
    device_id?: string
    device_label?: string
    use_local_vision?: boolean
    vl_api_key?: string
    vl_url?: string
    vl_model?: string
    capture_width?: number
    capture_height?: number
    jpeg_quality?: number
    max_dimension?: number
  }) => {
    try {
      logger.info('更新配置:', updates)
      db.updateCameraConfig(updates)
      logger.info('配置更新成功')
    }
    catch (error) {
      logger.error('更新配置失败:', error)
      throw error
    }
  })

  logger.info('摄像头配置 IPC 注册完成')
}
