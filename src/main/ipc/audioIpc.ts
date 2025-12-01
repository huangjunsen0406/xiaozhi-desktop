import type { AudioConfig } from '../types/audio'
import { OpusCodec } from '../audio/OpusCodec'
import { DatabaseManager } from '../services/database'
import { getLogger } from '../utils/logger'
import { SystemVolumeController } from '../utils/SystemVolumeController'
import { createIpcHandler, failure, success } from './middleware'

const logger = getLogger('AudioIpc')

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
    logger.info('创建 OpusCodec...')
    opusCodec = new OpusCodec()
  }
  return opusCodec
}

/**
 * 注册音频相关的 IPC 通道
 */
export function registerAudioIpc(): void {
  logger.info('注册音频 IPC 通道...')

  // 使用中间件注册处理器
  createIpcHandler({
    channel: 'audio:get-config',
    verbose: false,
    handler: async () => {
      const config = db.getFormattedAudioConfig()
      return success(config)
    },
  })

  createIpcHandler({
    channel: 'audio:update-config',
    schema: {
      config: { type: 'object', required: true },
    },
    handler: async (_event, ...args) => {
      const config = args[0] as Partial<AudioConfig>
      const dbUpdates: Record<string, unknown> = {}

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
      // 新增音频参数
      if ('inputSampleRate' in config) {
        dbUpdates.input_sample_rate = config.inputSampleRate
      }
      if ('outputSampleRate' in config) {
        dbUpdates.output_sample_rate = config.outputSampleRate
      }
      if ('channels' in config) {
        dbUpdates.channels = config.channels
      }
      if ('maxInputChannels' in config) {
        dbUpdates.max_input_channels = config.maxInputChannels
      }
      if ('maxOutputChannels' in config) {
        dbUpdates.max_output_channels = config.maxOutputChannels
      }
      if ('frameDuration' in config) {
        dbUpdates.frame_duration = config.frameDuration
      }

      db.updateAudioConfig(dbUpdates)
      logger.info('音频配置已保存到数据库:', dbUpdates)

      // 重新加载 AudioConfig
      const { AudioConfig: AudioConfigInstance } = await import('../constants/DeviceState')
      AudioConfigInstance.reload()

      return success()
    },
  })

  createIpcHandler({
    channel: 'audio:get-default-device-id',
    schema: {
      kind: { type: 'string', required: true },
    },
    handler: async (_event, ...args) => {
      const kind = args[0] as string
      if (kind !== 'input' && kind !== 'output') {
        return failure('kind 必须是 input 或 output')
      }

      const config = db.getFormattedAudioConfig()

      if (kind === 'input') {
        return success(config.inputDeviceName || null)
      }
      else {
        return success(config.outputDeviceName || null)
      }
    },
  })

  createIpcHandler({
    channel: 'audio:system-get-volume',
    handler: async () => {
      const volume = await systemVolumeController.getVolume()
      return success(volume)
    },
  })

  createIpcHandler({
    channel: 'audio:system-set-volume',
    schema: {
      volume: { type: 'number', required: true, min: 0, max: 100 },
    },
    handler: async (_event, ...args) => {
      const volume = args[0] as number
      await systemVolumeController.setVolume(volume)
      logger.info(`系统音量已设置为: ${volume}%`)
      return success()
    },
  })

  createIpcHandler({
    channel: 'audio:system-volume-supported',
    handler: async () => {
      return success(systemVolumeController.isSupported())
    },
  })

  logger.info('音频 IPC 通道已注册')
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
    logger.error('获取音频配置失败:', error)
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
    const dbUpdates: Record<string, string | boolean | null> = {}

    if ('inputDeviceName' in config) {
      dbUpdates.input_device_name = config.inputDeviceName || null
    }
    if ('outputDeviceName' in config) {
      dbUpdates.output_device_name = config.outputDeviceName || null
    }
    if ('enableNoiseReduction' in config) {
      dbUpdates.enable_noise_reduction = config.enableNoiseReduction ?? false
    }
    if ('enableEchoCancellation' in config) {
      dbUpdates.enable_echo_cancellation = config.enableEchoCancellation ?? false
    }
    if ('conversationMode' in config) {
      dbUpdates.conversation_mode = config.conversationMode ?? 'auto'
    }

    db.updateAudioConfig(dbUpdates)
  }
  catch (error) {
    logger.error('设置音频配置失败:', error)
  }
}
