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
  getConfig: async (): Promise<AudioConfig> => {
    const result: any = await ipcRenderer.invoke('audio:get-config')
    // 解包中间件响应格式 { success: true, data: AudioConfig }
    return result.data !== undefined ? result.data : result
  },

  // 更新音频配置
  updateConfig: (config: Partial<AudioConfig>): Promise<void> => ipcRenderer.invoke('audio:update-config', config),

  // 获取默认设备 ID
  getDefaultDeviceId: async (kind: 'input' | 'output'): Promise<string | null> => {
    const result: any = await ipcRenderer.invoke('audio:get-default-device-id', kind)
    // 解包中间件响应格式 { success: true, data: string | null }
    return result.data !== undefined ? result.data : result
  },

  // 获取系统音量
  systemGetVolume: async (): Promise<number> => {
    const result: any = await ipcRenderer.invoke('audio:system-get-volume')
    // 解包中间件响应格式 { success: true, data: number }
    return result.data !== undefined ? result.data : result
  },

  // 设置系统音量
  systemSetVolume: async (volume: number): Promise<void> => {
    await ipcRenderer.invoke('audio:system-set-volume', volume)
    // 中间件返回 { success: true }，我们不需要返回值
  },

  // 检查系统音量控制是否支持
  systemVolumeSupported: async (): Promise<boolean> => {
    const result: any = await ipcRenderer.invoke('audio:system-volume-supported')
    // 解包中间件响应格式 { success: true, data: boolean }
    return result.data !== undefined ? result.data : result
  },
}
