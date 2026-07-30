import { getActivationService } from '../services/ActivationService'
import { getLogger } from '../utils/logger'
import { createIpcHandler, failure, success } from './middleware'

const logger = getLogger('ActivationIpc')

/**
 * 注册激活相关的 IPC 通道（createIpcHandler + IpcResult）
 */
export function registerActivationIpc(): void {
  const activationService = getActivationService()

  /**
   * 初始化系统
   * data: { need_activation_ui, status_message }
   */
  createIpcHandler({
    channel: 'activation:initialize',
    handler: async () => {
      logger.info('开始系统初始化')

      // 先初始化基础设备信息
      const initResult = await activationService.initializeBasic()
      if (!initResult.success) {
        logger.warn('基础设备信息初始化失败', initResult.error)
      }

      // 再检查激活状态（包含 OTA 请求）
      const result = await activationService.checkActivationStatus()
      logger.info('系统初始化完成', result)

      if (!result.success) {
        return failure(result.error || result.message || '系统初始化失败')
      }

      return success({
        need_activation_ui: result.needActivationUI,
        status_message: result.message,
      })
    },
  })

  /**
   * 获取设备信息
   */
  createIpcHandler({
    channel: 'activation:get-device-info',
    handler: () => {
      const deviceInfo = activationService.getDeviceInfo()
      logger.info('获取设备信息', deviceInfo)
      return success(deviceInfo || {
        serialNumber: '',
        macAddress: '',
        activationStatus: false,
      })
    },
  })

  /**
   * 获取激活数据
   */
  createIpcHandler({
    channel: 'activation:get-activation-data',
    handler: () => {
      const activationData = activationService.getActivationData()
      logger.info('获取激活数据', activationData)
      return success(activationData)
    },
  })

  /**
   * 开始激活流程
   */
  createIpcHandler({
    channel: 'activation:start',
    schema: {
      activationData: { type: 'object', required: true },
    },
    handler: async (_event, activationDataUnknown: unknown) => {
      const activationData = activationDataUnknown as import('@shared/types').ActivationData
      logger.info('开始激活流程', activationData)
      const ok = await activationService.startActivation(activationData)
      logger.info('激活流程完成', ok)
      if (!ok) {
        return failure('激活失败')
      }
      return success()
    },
  })

  /**
   * 取消激活流程
   */
  createIpcHandler({
    channel: 'activation:cancel',
    handler: () => {
      logger.info('取消激活流程')
      activationService.cancelActivation()
      return success()
    },
  })

  /**
   * 检查激活状态
   */
  createIpcHandler({
    channel: 'activation:check-status',
    handler: () => {
      const activated = activationService.isActivated()
      logger.info('检查激活状态', activated)
      return success({ activated })
    },
  })

  logger.info('激活相关 IPC 通道已注册')
}
