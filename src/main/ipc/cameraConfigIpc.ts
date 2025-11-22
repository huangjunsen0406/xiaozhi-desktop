/**
 * 摄像头配置 IPC 处理
 */
import { ipcMain } from 'electron'
import { DatabaseManager } from '../services/database'

export function registerCameraConfigIpc(): void {
  const db = DatabaseManager.getInstance()

  /**
   * 获取摄像头配置
   */
  ipcMain.handle('camera-config:get', async () => {
    try {
      const config = db.getFormattedCameraConfig()
      console.log('[Camera Config IPC] 获取配置:', config)
      return config
    }
    catch (error) {
      console.error('[Camera Config IPC] 获取配置失败:', error)
      throw error
    }
  })

  /**
   * 更新摄像头配置
   */
  ipcMain.handle('camera-config:update', async (_event, updates: any) => {
    try {
      console.log('[Camera Config IPC] 更新配置:', updates)
      db.updateCameraConfig(updates)
      console.log('[Camera Config IPC] 配置更新成功')
    }
    catch (error) {
      console.error('[Camera Config IPC] 更新配置失败:', error)
      throw error
    }
  })

  console.log('[Camera Config IPC] 摄像头配置 IPC 注册完成')
}
