/**
 * 音频 API 模块
 */
import type { Buffer } from 'node:buffer'
import { ipcRenderer } from 'electron'

/**
 * 音频配置类型
 */
export interface AudioConfig {
  inputDeviceName?: string
  outputDeviceName?: string
  enableNoiseReduction: boolean
  enableEchoCancellation: boolean
  conversationMode: 'auto' | 'realtime'
}

export const audioApi = {
  // PCM 数据发送
  sendPCM: (pcm: Int16Array): void => ipcRenderer.send('audio:pcm', pcm),

  // Opus 解码回调
  onOpusDecoded: (callback: (pcm: Buffer) => void): void => {
    ipcRenderer.on('audio:opus-decoded', (_, pcm) => callback(pcm))
  },

  // 移除 Opus 解码监听器
  removeOpusDecodedListener: (): void => {
    ipcRenderer.removeAllListeners('audio:opus-decoded')
  },

  // 获取音频配置
  getConfig: (): Promise<AudioConfig> => ipcRenderer.invoke('audio:get-config'),

  // 更新音频配置
  updateConfig: (config: Partial<AudioConfig>): Promise<void> => ipcRenderer.invoke('audio:update-config', config),

  // 获取默认设备 ID
  getDefaultDeviceId: (kind: 'input' | 'output'): Promise<string | null> =>
    ipcRenderer.invoke('audio:get-default-device-id', kind),

  // 获取系统音量
  systemGetVolume: (): Promise<number> => ipcRenderer.invoke('audio:system-get-volume'),

  // 设置系统音量
  systemSetVolume: (volume: number): Promise<void> => ipcRenderer.invoke('audio:system-set-volume', volume),

  // 检查系统音量控制是否支持
  systemVolumeSupported: (): Promise<boolean> => ipcRenderer.invoke('audio:system-volume-supported'),
}
