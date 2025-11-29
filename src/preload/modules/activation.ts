import type {
  ActivationData,
  ActivationInitResult,
  ActivationResult,
  ActivationStatus,
  DeviceInfo,
} from '@shared/types'
import { ipcRenderer } from 'electron'

export type {
  ActivationData,
  ActivationResult,
  ActivationStatus,
  DeviceInfo,
  ActivationInitResult as InitResult,
}

export const activationApi = {
  initialize: (): Promise<ActivationInitResult> => ipcRenderer.invoke('activation:initialize'),
  getDeviceInfo: (): Promise<DeviceInfo> => ipcRenderer.invoke('activation:get-device-info'),
  getActivationData: (): Promise<ActivationData | null> => ipcRenderer.invoke('activation:get-activation-data'),
  start: (data: ActivationData): Promise<ActivationResult> => ipcRenderer.invoke('activation:start', data),
  cancel: (): Promise<ActivationResult> => ipcRenderer.invoke('activation:cancel'),
  checkStatus: (): Promise<ActivationStatus> => ipcRenderer.invoke('activation:check-status'),
}
