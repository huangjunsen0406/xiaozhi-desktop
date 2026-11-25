import type {
  ActivationData,
  ActivationInitResult,
  ActivationResult,
  ActivationStatus,
  DeviceInfo,
} from '@shared/types'
import { invokeData, invokeVoid } from '../utils/ipc'

export const activationApi = {
  initialize: (): Promise<ActivationInitResult> =>
    invokeData('activation:initialize', '系统初始化失败'),

  getDeviceInfo: (): Promise<DeviceInfo> =>
    invokeData('activation:get-device-info', '获取设备信息失败'),

  getActivationData: (): Promise<ActivationData | null> =>
    invokeData('activation:get-activation-data', '获取激活数据失败'),

  start: async (data: ActivationData): Promise<ActivationResult> => {
    await invokeVoid('activation:start', '激活失败', data)
    return { success: true }
  },

  cancel: async (): Promise<ActivationResult> => {
    await invokeVoid('activation:cancel', '取消激活失败')
    return { success: true }
  },

  checkStatus: (): Promise<ActivationStatus> =>
    invokeData('activation:check-status', '检查激活状态失败'),
}
