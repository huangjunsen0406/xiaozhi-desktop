import type { AecStatus, AudioConfig, IpcResult } from '@shared/types'
/**
 * 音频 API 模块
 */
import type { Buffer } from 'node:buffer'
import { ipcRenderer } from 'electron'
import { unwrapIpcResult } from '../utils/ipc'

export type { AudioConfig }

export interface AudioUpdateConfigResult {
  requiresRelaunch?: boolean
  aecMode?: AudioConfig['aecMode']
  aecStatus?: AecStatus
  /** 仅设备变更时通知了 switchDevices */
  deviceSwitched?: boolean
  /** AEC/NS 或编解码参数触发了采集/上下文重建 */
  captureReinitialized?: boolean
  codecRebuilt?: boolean
  /** 已连接且执行了协议 idle 重连 */
  protocolReconnected?: boolean
  applied?: {
    devicesChanged?: boolean
    codecParamsChanged?: boolean
    processingChanged?: boolean
    conversationModeChanged?: boolean
    audioWindowAction?: 'none' | 'switchDevices' | 'reinitialize'
  }
}

export const audioApi = {
  // PCM 数据发送
  sendPCM: (pcm: Int16Array): void => ipcRenderer.send('audio:pcm', pcm),

  // Opus 解码回调
  onOpusDecoded: (callback: (pcm: Buffer) => void): () => void => {
    const handler = (_: Electron.IpcRendererEvent, pcm: Buffer) => callback(pcm)
    ipcRenderer.on('audio:opus-decoded', handler)
    return () => ipcRenderer.off('audio:opus-decoded', handler)
  },

  // 获取音频配置
  getConfig: async (): Promise<AudioConfig> => {
    const result = await ipcRenderer.invoke('audio:get-config') as IpcResult<AudioConfig> | AudioConfig
    return unwrapIpcResult<AudioConfig>(result, '获取音频配置失败')
  },

  // 更新音频配置（可能返回 requiresRelaunch）
  updateConfig: async (config: Partial<AudioConfig>): Promise<AudioUpdateConfigResult | void> => {
    const result = await ipcRenderer.invoke('audio:update-config', config) as IpcResult<AudioUpdateConfigResult | void>
    return unwrapIpcResult(result, '更新音频配置失败')
  },

  getAecStatus: async (): Promise<AecStatus> => {
    const result = await ipcRenderer.invoke('audio:get-aec-status') as IpcResult<AecStatus> | AecStatus
    return unwrapIpcResult<AecStatus>(result, '获取 AEC 状态失败')
  },

  reportAecCapture: async (payload: { echoCancellationApplied?: boolean }): Promise<AecStatus> => {
    const result = await ipcRenderer.invoke('audio:report-aec-capture', payload) as IpcResult<AecStatus> | AecStatus
    return unwrapIpcResult<AecStatus>(result, '上报 AEC 采集状态失败')
  },

  // 获取默认设备 ID
  getDefaultDeviceId: async (kind: 'input' | 'output'): Promise<string | null> => {
    const result = await ipcRenderer.invoke('audio:get-default-device-id', kind) as IpcResult<string | null> | string | null
    return unwrapIpcResult<string | null>(result, '获取默认设备ID失败')
  },

  // 获取系统音量
  systemGetVolume: async (): Promise<number> => {
    const result = await ipcRenderer.invoke('audio:system-get-volume') as IpcResult<number> | number
    return unwrapIpcResult<number>(result, '获取系统音量失败')
  },

  // 设置系统音量
  systemSetVolume: async (volume: number): Promise<void> => {
    const result = await ipcRenderer.invoke('audio:system-set-volume', volume) as IpcResult<void>
    unwrapIpcResult(result, '设置系统音量失败')
  },

  // 检查系统音量控制是否支持
  systemVolumeSupported: async (): Promise<boolean> => {
    const result = await ipcRenderer.invoke('audio:system-volume-supported') as IpcResult<boolean> | boolean
    return unwrapIpcResult<boolean>(result, '获取系统音量支持状态失败')
  },
}
