/**
 * 摄像头配置 IPC 处理
 */
import { ipcMain } from 'electron'
import { getDatabase } from '../services/database'
import { getLogger } from '../utils/logger'

const logger = getLogger('CameraConfigIpc')

export function registerCameraConfigIpc(): void {
  const db = getDatabase()

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
    deviceId?: string
    deviceLabel?: string
    useLocalVision?: boolean
    vlApiKey?: string
    vlUrl?: string
    vlModel?: string
    captureWidth?: number
    captureHeight?: number
    jpegQuality?: number
    maxDimension?: number
  }) => {
    try {
      logger.info('更新配置:', updates)
      const dbUpdates: {
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
      } = {}

      if (updates.enabled !== undefined)
        dbUpdates.enabled = updates.enabled
      if (updates.deviceId !== undefined)
        dbUpdates.device_id = updates.deviceId
      if (updates.deviceLabel !== undefined)
        dbUpdates.device_label = updates.deviceLabel
      if (updates.useLocalVision !== undefined)
        dbUpdates.use_local_vision = updates.useLocalVision
      if (updates.vlApiKey !== undefined)
        dbUpdates.vl_api_key = updates.vlApiKey
      if (updates.vlUrl !== undefined)
        dbUpdates.vl_url = updates.vlUrl
      if (updates.vlModel !== undefined)
        dbUpdates.vl_model = updates.vlModel
      if (updates.captureWidth !== undefined)
        dbUpdates.capture_width = updates.captureWidth
      if (updates.captureHeight !== undefined)
        dbUpdates.capture_height = updates.captureHeight
      if (updates.jpegQuality !== undefined)
        dbUpdates.jpeg_quality = updates.jpegQuality
      if (updates.maxDimension !== undefined)
        dbUpdates.max_dimension = updates.maxDimension

      db.updateCameraConfig(dbUpdates)
      logger.info('配置更新成功')
    }
    catch (error) {
      logger.error('更新配置失败:', error)
      throw error
    }
  })

  logger.info('摄像头配置 IPC 注册完成')
}
