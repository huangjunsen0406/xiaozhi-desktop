import { ipcMain } from 'electron'
import { getActivationService } from '../services/ActivationService'
import { getLogger } from '../utils/logger'

const logger = getLogger('ActivationIpc')

/**
 * 注册激活相关的 IPC 通道
 */
export function registerActivationIpc(): void {
  const activationService = getActivationService()

  /**
   * 初始化系统
   */
  ipcMain.handle('activation:initialize', async () => {
    try {
      logger.info('开始系统初始化')

      // 先初始化基础设备信息
      const initResult = await activationService.initializeBasic()
      if (!initResult.success) {
        logger.warn('基础设备信息初始化失败', initResult.error)
      }

      // 再检查激活状态（包含 OTA 请求）
      const result = await activationService.checkActivationStatus()
      logger.info('系统初始化完成', result)

      return {
        success: result.success,
        need_activation_ui: result.needActivationUI,
        status_message: result.message,
        error: result.error,
      }
    }
    catch (error) {
      logger.error('系统初始化失败', error)
      return {
        success: false,
        need_activation_ui: false,
        error: String(error),
      }
    }
  })

  /**
   * 获取设备信息
   */
  ipcMain.handle('activation:get-device-info', () => {
    try {
      const deviceInfo = activationService.getDeviceInfo()
      logger.info('获取设备信息', deviceInfo)
      return deviceInfo || {
        serialNumber: '',
        macAddress: '',
        activationStatus: false,
      }
    }
    catch (error) {
      logger.error('获取设备信息失败', error)
      return {
        serialNumber: '',
        macAddress: '',
        activationStatus: false,
      }
    }
  })

  /**
   * 获取激活数据
   */
  ipcMain.handle('activation:get-activation-data', () => {
    try {
      const activationData = activationService.getActivationData()
      logger.info('获取激活数据', activationData)
      return activationData
    }
    catch (error) {
      logger.error('获取激活数据失败', error)
      return null
    }
  })

  /**
   * 开始激活流程
   */
  ipcMain.handle('activation:start', async (_, activationData) => {
    try {
      logger.info('开始激活流程', activationData)
      const success = await activationService.startActivation(activationData)
      logger.info('激活流程完成', success)
      return { success }
    }
    catch (error) {
      logger.error('激活流程失败', error)
      return { success: false, error: String(error) }
    }
  })

  /**
   * 取消激活流程
   */
  ipcMain.handle('activation:cancel', () => {
    try {
      logger.info('取消激活流程')
      activationService.cancelActivation()
      return { success: true }
    }
    catch (error) {
      logger.error('取消激活失败', error)
      return { success: false, error: String(error) }
    }
  })

  /**
   * 检查激活状态
   */
  ipcMain.handle('activation:check-status', () => {
    try {
      const isActivated = activationService.isActivated()
      logger.info('检查激活状态', isActivated)
      return { isActivated }
    }
    catch (error) {
      logger.error('检查激活状态失败', error)
      return { isActivated: false }
    }
  })

  logger.info('激活相关 IPC 通道已注册')
}
