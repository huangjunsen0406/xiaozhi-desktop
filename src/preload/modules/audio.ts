import type { AudioConfig, IpcResult } from '@shared/types'
/**
 * 音频 API 模块
 */
import type { Buffer } from 'node:buffer'
import { ipcRenderer } from 'electron'
import { unwrapIpcResult } from '../utils/ipc'

export type { AudioConfig }

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

  // 更新音频配置
  updateConfig: async (config: Partial<AudioConfig>): Promise<void> => {
    const result = await ipcRenderer.invoke('audio:update-config', config) as IpcResult<void>
    unwrapIpcResult(result, '更新音频配置失败')
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
