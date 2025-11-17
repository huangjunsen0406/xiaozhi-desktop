import type { AudioConfig } from '../types/audio'
import { ipcMain } from 'electron'
import { OpusCodec } from '../audio/OpusCodec'
import { DatabaseManager } from '../services/database'
import { SystemVolumeController } from '../utils/SystemVolumeController'

// Opus 编解码器实例
let opusCodec: OpusCodec | null = null

// 数据库实例
const db = DatabaseManager.getInstance()

// 系统音量控制器实例
const systemVolumeController = new SystemVolumeController()

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

  // 获取音频配置（不包含音量，音量从系统实时读取）
  ipcMain.handle('audio:get-config', async () => {
    try {
      const config = db.getFormattedAudioConfig()
      return config
    }
    catch (error) {
      console.error('[Audio IPC] 获取音频配置失败:', error)
      // 返回默认配置（不包含音量）
      return {
        enableNoiseReduction: true,
        enableEchoCancellation: true,
        conversationMode: 'auto',
      }
    }
  })

  ipcMain.handle('audio:update-config', async (_, config: Partial<AudioConfig>) => {
    try {
      const dbUpdates: any = {}

      if ('inputDeviceName' in config) {
        dbUpdates.input_device_name = config.inputDeviceName || null
      }
      if ('outputDeviceName' in config) {
        dbUpdates.output_device_name = config.outputDeviceName || null
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

  // 获取默认设备名称 (渲染进程会使用 enumerateDevices 获取实际设备列表并匹配)
  ipcMain.handle('audio:get-default-device-id', async (_, kind: 'input' | 'output') => {
    try {
      const config = db.getFormattedAudioConfig()

      if (kind === 'input') {
        return config.inputDeviceName || null
      }
      else {
        return config.outputDeviceName || null
      }
    }
    catch (error) {
      console.error('[Audio IPC] 获取默认设备名称失败:', error)
      return null
    }
  })

  // 获取系统输出音量 (扬声器)
  ipcMain.handle('audio:system-get-volume', async () => {
    try {
      const volume = await systemVolumeController.getVolume()
      return volume
    }
    catch (error) {
      console.error('[Audio IPC] 获取系统音量失败:', error)
      return 70
    }
  })

  // 设置系统输出音量 (扬声器)
  ipcMain.handle('audio:system-set-volume', async (_, volume: number) => {
    try {
      await systemVolumeController.setVolume(volume)
      console.log(`[Audio IPC] 系统音量已设置为: ${volume}%`)
    }
    catch (error) {
      console.error('[Audio IPC] 设置系统音量失败:', error)
      throw error
    }
  })

  // 检查系统音量控制是否支持
  ipcMain.handle('audio:system-volume-supported', async () => {
    return systemVolumeController.isSupported()
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
 * 注意: 不包含音量，音量从系统实时读取
 */
export function getAudioConfig(): Partial<AudioConfig> {
  try {
    return db.getFormattedAudioConfig()
  }
  catch (error) {
    console.error('[Audio IPC] 获取音频配置失败:', error)
    // 返回默认配置（不包含音量）
    return {
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
    const dbUpdates: any = {}

    if ('inputDeviceName' in config) {
      dbUpdates.input_device_name = config.inputDeviceName || null
    }
    if ('outputDeviceName' in config) {
      dbUpdates.output_device_name = config.outputDeviceName || null
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
