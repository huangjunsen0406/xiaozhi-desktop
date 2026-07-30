import type {
  ActivationData,
  ActivationInitResult,
  ActivationResult,
  ActivationStatus,
  DeviceInfo,
} from '@shared/types'
import { ipcRenderer } from 'electron'
import { assertIpcSuccess, unwrapIpcResult } from '../utils/ipc'

export type {
  ActivationData,
  ActivationResult,
  ActivationStatus,
  DeviceInfo,
  ActivationInitResult as InitResult,
}

export const activationApi = {
  initialize: async (): Promise<ActivationInitResult> => {
    const result: unknown = await ipcRenderer.invoke('activation:initialize')
    return unwrapIpcResult<ActivationInitResult>(result, '系统初始化失败')
  },

  getDeviceInfo: async (): Promise<DeviceInfo> => {
    const result: unknown = await ipcRenderer.invoke('activation:get-device-info')
    return unwrapIpcResult<DeviceInfo>(result, '获取设备信息失败')
  },

  getActivationData: async (): Promise<ActivationData | null> => {
    const result: unknown = await ipcRenderer.invoke('activation:get-activation-data')
    return unwrapIpcResult<ActivationData | null>(result, '获取激活数据失败')
  },

  start: async (data: ActivationData): Promise<ActivationResult> => {
    const result: unknown = await ipcRenderer.invoke('activation:start', data)
    assertIpcSuccess(result, '激活失败')
    return { success: true }
  },

  cancel: async (): Promise<ActivationResult> => {
    const result: unknown = await ipcRenderer.invoke('activation:cancel')
    assertIpcSuccess(result, '取消激活失败')
    return { success: true }
  },

  checkStatus: async (): Promise<ActivationStatus> => {
    const result: unknown = await ipcRenderer.invoke('activation:check-status')
    return unwrapIpcResult<ActivationStatus>(result, '检查激活状态失败')
  },
}
