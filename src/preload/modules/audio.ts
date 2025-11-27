/**
 * 音频 API 模块
 */
import type { Buffer } from 'node:buffer'
import { ipcRenderer } from 'electron'

/**
 * IPC 结果类型
 */
interface IpcResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

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
    const result = await ipcRenderer.invoke('audio:get-config') as IpcResult<AudioConfig>
    // 解包中间件响应格式 { success: true, data: AudioConfig }
    return result.data !== undefined ? result.data : (result as unknown as AudioConfig)
  },

  // 更新音频配置
  updateConfig: async (config: Partial<AudioConfig>): Promise<void> => {
    const result = await ipcRenderer.invoke('audio:update-config', config) as IpcResult<void>
    // 解包中间件响应格式 { success: true } 或 { success: false, error: string }
    if (!result.success) {
      throw new Error(result.error || '更新音频配置失败')
    }
  },

  // 获取默认设备 ID
  getDefaultDeviceId: async (kind: 'input' | 'output'): Promise<string | null> => {
    const result = await ipcRenderer.invoke('audio:get-default-device-id', kind) as IpcResult<string | null>
    // 解包中间件响应格式 { success: true, data: string | null }
    return result.data !== undefined ? result.data : null
  },

  // 获取系统音量
  systemGetVolume: async (): Promise<number> => {
    const result = await ipcRenderer.invoke('audio:system-get-volume') as IpcResult<number>
    // 解包中间件响应格式 { success: true, data: number }
    return result.data !== undefined ? result.data : 0
  },

  // 设置系统音量
  systemSetVolume: async (volume: number): Promise<void> => {
    const result = await ipcRenderer.invoke('audio:system-set-volume', volume) as IpcResult<void>
    // 解包中间件响应格式 { success: true } 或 { success: false, error: string }
    if (!result.success) {
      throw new Error(result.error || '设置系统音量失败')
    }
  },

  // 检查系统音量控制是否支持
  systemVolumeSupported: async (): Promise<boolean> => {
    const result = await ipcRenderer.invoke('audio:system-volume-supported') as IpcResult<boolean>
    // 解包中间件响应格式 { success: true, data: boolean }
    return result.data !== undefined ? result.data : false
  },
}
