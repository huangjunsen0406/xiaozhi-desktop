import type { IoTDeviceDescriptor, IoTDeviceState, IoTResponse } from '../index.d'
import { ipcRenderer } from 'electron'

/**
 * IoT 控制 API
 */
export const iotApi = {
  /**
   * 获取所有设备描述符
   */
  getDevices: (): Promise<IoTResponse<IoTDeviceDescriptor[]>> => {
    return ipcRenderer.invoke('iot:get-devices')
  },

  /**
   * 获取所有设备状态
   */
  getStates: (): Promise<IoTResponse<IoTDeviceState[]>> => {
    return ipcRenderer.invoke('iot:get-states')
  },

  /**
   * 获取指定设备状态
   */
  getDeviceState: (deviceName: string): Promise<IoTResponse<IoTDeviceState>> => {
    return ipcRenderer.invoke('iot:get-device-state', deviceName)
  },

  /**
   * 调用设备方法
   */
  invokeMethod: (
    deviceName: string,
    method: string,
    parameters?: Record<string, unknown>,
  ): Promise<IoTResponse<unknown>> => {
    return ipcRenderer.invoke('iot:invoke-method', deviceName, method, parameters)
  },
}
