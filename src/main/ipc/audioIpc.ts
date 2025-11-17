import type { AudioConfig } from '../types/audio'
import { ipcMain } from 'electron'
import { OpusCodec } from '../audio/OpusCodec'
import { DatabaseManager } from '../services/database'

// Opus 编解码器实例
let opusCodec: OpusCodec | null = null

// 数据库实例
const db = DatabaseManager.getInstance()

/**
 * 初始化 OpusCodec (供 AudioPlugin 调用)
 */
export function initOpusCodec(): OpusCodec {
  if (!opusCodec) {
    console.log('[Audio IPC] 创建 OpusCodec...')
    opusCodec = new OpusCodec()
  }
  return opusCodec
}

/**
 * 注册音频相关的 IPC 通道
 */
export function registerAudioIpc(): void {
  console.log('[Audio IPC] 注册音频 IPC 通道...')

  // 获取音频配置
  ipcMain.handle('audio:get-config', async () => {
    try {
      const config = db.getFormattedAudioConfig()
      return config
    }
    catch (error) {
      console.error('[Audio IPC] 获取音频配置失败:', error)
      // 返回默认配置
      return {
        microphoneVolume: 80,
        speakerVolume: 70,
        enableNoiseReduction: true,
        enableEchoCancellation: true,
        conversationMode: 'auto',
      }
    }
  })

  // 更新音频配置
  ipcMain.handle('audio:update-config', async (_, config: Partial<AudioConfig>) => {
    try {
      // 转换字段名（camelCase -> snake_case）
      const dbUpdates: any = {}

      if ('inputDeviceId' in config) {
        dbUpdates.input_device_id = config.inputDeviceId || null
      }
      if ('outputDeviceId' in config) {
        dbUpdates.output_device_id = config.outputDeviceId || null
      }
      if ('microphoneVolume' in config) {
        dbUpdates.microphone_volume = config.microphoneVolume
      }
      if ('speakerVolume' in config) {
        dbUpdates.speaker_volume = config.speakerVolume
      }
      if ('enableNoiseReduction' in config) {
        dbUpdates.enable_noise_reduction = config.enableNoiseReduction
      }
      if ('enableEchoCancellation' in config) {
        dbUpdates.enable_echo_cancellation = config.enableEchoCancellation
      }
      if ('conversationMode' in config) {
        dbUpdates.conversation_mode = config.conversationMode
      }

      db.updateAudioConfig(dbUpdates)
      console.log('[Audio IPC] 音频配置已保存到数据库:', dbUpdates)
    }
    catch (error) {
      console.error('[Audio IPC] 保存音频配置失败:', error)
      throw error
    }
  })

  // 获取默认设备ID (渲染进程会使用 enumerateDevices 获取实际设备列表)
  ipcMain.handle('audio:get-default-device-id', async (_, kind: 'input' | 'output') => {
    try {
      const config = db.getFormattedAudioConfig()

      if (kind === 'input') {
        return config.inputDeviceId || null
      }
      else {
        return config.outputDeviceId || null
      }
    }
    catch (error) {
      console.error('[Audio IPC] 获取默认设备ID失败:', error)
      return null
    }
  })

  console.log('[Audio IPC] 音频 IPC 通道已注册')
}

/**
 * 获取 OpusCodec 实例 (供其他模块使用)
 */
export function getOpusCodec(): OpusCodec | null {
  return opusCodec
}

/**
 * 获取音频配置 (供其他模块使用)
 */
export function getAudioConfig(): AudioConfig {
  try {
    return db.getFormattedAudioConfig() as AudioConfig
  }
  catch (error) {
    console.error('[Audio IPC] 获取音频配置失败:', error)
    // 返回默认配置
    return {
      microphoneVolume: 80,
      speakerVolume: 70,
      enableNoiseReduction: true,
      enableEchoCancellation: true,
      conversationMode: 'auto',
    }
  }
}

/**
 * 设置音频配置 (供其他模块使用)
 */
export function setAudioConfig(config: Partial<AudioConfig>): void {
  try {
    // 转换字段名
    const dbUpdates: any = {}

    if ('inputDeviceId' in config) {
      dbUpdates.input_device_id = config.inputDeviceId || null
    }
    if ('outputDeviceId' in config) {
      dbUpdates.output_device_id = config.outputDeviceId || null
    }
    if ('microphoneVolume' in config) {
      dbUpdates.microphone_volume = config.microphoneVolume
    }
    if ('speakerVolume' in config) {
      dbUpdates.speaker_volume = config.speakerVolume
    }
    if ('enableNoiseReduction' in config) {
      dbUpdates.enable_noise_reduction = config.enableNoiseReduction
    }
    if ('enableEchoCancellation' in config) {
      dbUpdates.enable_echo_cancellation = config.enableEchoCancellation
    }
    if ('conversationMode' in config) {
      dbUpdates.conversation_mode = config.conversationMode
    }

    db.updateAudioConfig(dbUpdates)
  }
  catch (error) {
    console.error('[Audio IPC] 设置音频配置失败:', error)
  }
}
