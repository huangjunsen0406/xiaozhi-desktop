import type {
  AecCaptureReport,
  AecStatus,
  AudioSettings,
  AudioUpdateSettingsResult,
  PcmAudioData,
} from '@shared/types'
/**
 * 音频 API 模块
 */
import { ipcRenderer } from 'electron'
import { unwrapIpcResult } from '../utils/ipc'

export const audioApi = {
  // PCM 数据发送
  sendPCM: (pcm: Int16Array): void => ipcRenderer.send('audio:pcm', pcm),

  // Opus 解码回调
  onOpusDecoded: (callback: (pcm: PcmAudioData) => void): () => void => {
    const handler = (_: Electron.IpcRendererEvent, pcm: PcmAudioData) => callback(pcm)
    ipcRenderer.on('audio:opus-decoded', handler)
    return () => ipcRenderer.off('audio:opus-decoded', handler)
  },

  // 获取音频设置
  getConfig: async (): Promise<AudioSettings> => {
    const result: unknown = await ipcRenderer.invoke('audio:get-config')
    return unwrapIpcResult<AudioSettings>(result, '获取音频设置失败')
  },

  // 更新音频设置（可能返回 requiresRelaunch）
  updateConfig: async (config: Partial<AudioSettings>): Promise<AudioUpdateSettingsResult | void> => {
    const result: unknown = await ipcRenderer.invoke('audio:update-config', config)
    return unwrapIpcResult(result, '更新音频设置失败')
  },

  getAecStatus: async (): Promise<AecStatus> => {
    const result: unknown = await ipcRenderer.invoke('audio:get-aec-status')
    return unwrapIpcResult<AecStatus>(result, '获取 AEC 状态失败')
  },

  reportAecCapture: async (payload: AecCaptureReport): Promise<AecStatus> => {
    const result: unknown = await ipcRenderer.invoke('audio:report-aec-capture', payload)
    return unwrapIpcResult<AecStatus>(result, '上报 AEC 采集状态失败')
  },

  // 获取配置中保存的首选设备名称
  getPreferredDeviceName: async (kind: 'input' | 'output'): Promise<string | null> => {
    const result: unknown = await ipcRenderer.invoke('audio:get-preferred-device-name', kind)
    return unwrapIpcResult<string | null>(result, '获取首选设备名称失败')
  },

  // 获取系统音量
  systemGetVolume: async (): Promise<number> => {
    const result: unknown = await ipcRenderer.invoke('audio:system-get-volume')
    return unwrapIpcResult<number>(result, '获取系统音量失败')
  },

  // 设置系统音量
  systemSetVolume: async (volume: number): Promise<void> => {
    const result: unknown = await ipcRenderer.invoke('audio:system-set-volume', volume)
    unwrapIpcResult(result, '设置系统音量失败')
  },

  // 检查系统音量控制是否支持
  systemVolumeSupported: async (): Promise<boolean> => {
    const result: unknown = await ipcRenderer.invoke('audio:system-volume-supported')
    return unwrapIpcResult<boolean>(result, '获取系统音量支持状态失败')
  },
}
