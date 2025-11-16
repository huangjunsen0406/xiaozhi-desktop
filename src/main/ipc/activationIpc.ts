import { ipcMain } from 'electron'
import { SystemInitializer } from '../services/systemInitializer'
import { ActivationManager } from '../services/activationManager'
import { DeviceFingerprintManager } from '../services/deviceFingerprintDB'
import { getGlobalInitializer } from '../services/activationHandler'

/**
 * 注册激活相关的 IPC 通道
 */
export function registerActivationIpc(): void {
  let systemInitializer: SystemInitializer | null = null
  let activationManager: ActivationManager | null = null

  /**
   * 初始化系统
   */
  ipcMain.handle('activation:initialize', async () => {
    try {
      console.log('IPC: 开始系统初始化')
      systemInitializer = new SystemInitializer()
      const result = await systemInitializer.runInitialization()
      console.log('IPC: 系统初始化完成', result)
      return result
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
      const deviceFingerprint = DeviceFingerprintManager.getInstance()
      const deviceInfo = deviceFingerprint.getDeviceInfo()
      console.log('IPC: 获取设备信息', deviceInfo)
      return deviceInfo
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
      // 优先从全局初始化器获取
      const globalInit = getGlobalInitializer()
      const initializer = systemInitializer || globalInit

      if (!initializer) {
        console.log('IPC: 初始化器不存在，无法获取激活数据')
        return null
      }

      const activationData = initializer.getActivationData()
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
      activationManager = ActivationManager.getInstance()
      const success = await activationManager.processActivation(activationData)
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
      if (activationManager) {
        activationManager.cancelActivation()
      }
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
      const deviceFingerprint = DeviceFingerprintManager.getInstance()
      const isActivated = deviceFingerprint.isActivated()
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
