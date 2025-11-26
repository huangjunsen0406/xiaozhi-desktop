import { ipcMain } from 'electron'
import { getActivationService } from '../services/ActivationService'

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
      console.log('IPC: 开始系统初始化')
      const result = await activationService.handleStartup()
      console.log('IPC: 系统初始化完成', result)
      return {
        success: result.success,
        need_activation_ui: result.needActivationUI,
        status_message: result.message,
        error: result.error,
      }
    }
    catch (error) {
      console.error('IPC: 系统初始化失败', error)
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
      console.log('IPC: 获取设备信息', deviceInfo)
      return deviceInfo || {
        serialNumber: '',
        macAddress: '',
        activationStatus: false,
      }
    }
    catch (error) {
      console.error('IPC: 获取设备信息失败', error)
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
      console.log('IPC: 获取激活数据', activationData)
      return activationData
    }
    catch (error) {
      console.error('IPC: 获取激活数据失败', error)
      return null
    }
  })

  /**
   * 开始激活流程
   */
  ipcMain.handle('activation:start', async (_, activationData) => {
    try {
      console.log('IPC: 开始激活流程', activationData)
      const success = await activationService.startActivation(activationData)
      console.log('IPC: 激活流程完成', success)
      return { success }
    }
    catch (error) {
      console.error('IPC: 激活流程失败', error)
      return { success: false, error: String(error) }
    }
  })

  /**
   * 取消激活流程
   */
  ipcMain.handle('activation:cancel', () => {
    try {
      console.log('IPC: 取消激活流程')
      activationService.cancelActivation()
      return { success: true }
    }
    catch (error) {
      console.error('IPC: 取消激活失败', error)
      return { success: false, error: String(error) }
    }
  })

  /**
   * 检查激活状态
   */
  ipcMain.handle('activation:check-status', () => {
    try {
      const isActivated = activationService.isActivated()
      console.log('IPC: 检查激活状态', isActivated)
      return { isActivated }
    }
    catch (error) {
      console.error('IPC: 检查激活状态失败', error)
      return { isActivated: false }
    }
  })

  console.log('激活相关 IPC 通道已注册')
}
