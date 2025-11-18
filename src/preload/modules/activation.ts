/**
 * 激活 API 模块
 */
import { ipcRenderer } from 'electron'

/**
 * 初始化结果类型
 */
export interface InitResult {
  success: boolean
  need_activation_ui: boolean
  error?: string
}

/**
 * 设备信息类型
 */
export interface DeviceInfo {
  serialNumber: string
  macAddress: string
  activationStatus: boolean
}

/**
 * 激活数据类型
 */
export interface ActivationData {
  challenge: string
  code: string
  message?: string
}

/**
 * 激活结果类型
 */
export interface ActivationResult {
  success: boolean
  error?: string
}

/**
 * 激活状态类型
 */
export interface ActivationStatus {
  isActivated: boolean
}

export const activationApi = {
  // 初始化系统
  initialize: (): Promise<InitResult> => ipcRenderer.invoke('activation:initialize'),

  // 获取设备信息
  getDeviceInfo: (): Promise<DeviceInfo> => ipcRenderer.invoke('activation:get-device-info'),

  // 获取激活数据
  getActivationData: (): Promise<ActivationData | null> => ipcRenderer.invoke('activation:get-activation-data'),

  // 开始激活流程
  start: (data: ActivationData): Promise<ActivationResult> => ipcRenderer.invoke('activation:start', data),

  // 取消激活流程
  cancel: (): Promise<ActivationResult> => ipcRenderer.invoke('activation:cancel'),

  // 检查激活状态
  checkStatus: (): Promise<ActivationStatus> => ipcRenderer.invoke('activation:check-status'),
}
