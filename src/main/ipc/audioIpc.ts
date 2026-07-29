import type { AudioConfig, AudioSettings } from '@shared/types'
import { BrowserWindow } from 'electron'
import { getAudioRuntime } from '../audio/AudioRuntime'
import { OpusCodec } from '../audio/OpusCodec'
import { getServiceContainer } from '../core/ServiceContainer'
import { getDatabase } from '../services/database'
import { getLogger } from '../utils/logger'
import { SystemVolumeController } from '../utils/SystemVolumeController'
import { createIpcHandler, failure, success } from './middleware'

const logger = getLogger('AudioIpc')

// Opus 编解码器实例
let opusCodec: OpusCodec | null = null

// 系统音量控制器实例
const systemVolumeController = new SystemVolumeController()

const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  enableNoiseReduction: true,
  enableEchoCancellation: true,
  conversationMode: 'auto',
}

/**
 * 将 settings partial 映射为 DB 列更新
 */
function settingsToDbUpdates(config: Partial<AudioSettings>): Record<string, unknown> {
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
  if ('inputSampleRate' in config) {
    dbUpdates.input_sample_rate = config.inputSampleRate
  }
  if ('outputSampleRate' in config) {
    dbUpdates.output_sample_rate = config.outputSampleRate
  }
  if ('channels' in config) {
    dbUpdates.channels = config.channels
  }
  if ('frameDuration' in config) {
    dbUpdates.frame_duration = config.frameDuration
  }

  return dbUpdates
}

function affectsCodecParams(config: Partial<AudioSettings>): boolean {
  return 'inputSampleRate' in config
    || 'outputSampleRate' in config
    || 'channels' in config
    || 'frameDuration' in config
}

/**
 * 初始化 OpusCodec (供 AudioPlugin 调用)
 * 要求已 initializeAudioRuntime()
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
  const db = getDatabase()

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
      const config = args[0] as Partial<AudioSettings>
      const dbUpdates = settingsToDbUpdates(config)

      db.updateAudioConfig(dbUpdates)
      logger.info('音频设置已保存到数据库:', dbUpdates)

      // Settings → Runtime：写 DB 后统一 reload
      getAudioRuntime().reload()

      // 检查是否需要重建 OpusCodec（采样率或帧长度变化）
      const needsRebuild = affectsCodecParams(config)

      if (needsRebuild) {
        // 重建 OpusCodec（读 runtime 新参数）
        const codec = getOpusCodec()
        if (codec) {
          codec.rebuild()
          logger.info('✓ OpusCodec 已根据新配置重建')
        }

        // 通知后台音频窗口完整重建 AudioContext
        const windows = BrowserWindow.getAllWindows()
        let notified = false

        windows.forEach((win) => {
          if (win.isDestroyed())
            return
          // 判断是否是后台音频窗口（通过 URL 判断）
          const url = win.webContents.getURL()
          if (url.includes('audio.html') || url.includes('#/audio')) {
            win.webContents.send('audio:command', 'reinitialize')
            notified = true
          }
        })

        if (notified) {
          logger.info('✓ 已通知后台音频窗口重建 AudioContext')
        }
        else {
          logger.warn('未找到后台音频窗口，配置将在下次初始化时生效')
        }

        // 触发协议重连，让新 hello 携带新的音频参数
        try {
          const container = getServiceContainer()
          await container.reconnectProtocol()
        }
        catch (error) {
          logger.error('音频参数变化后协议重连失败（不影响音频重建）:', error)
        }
      }

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
 * 获取音频 Settings（用户偏好 DTO，非编解码热路径）
 * 注意: 不包含音量，音量从系统实时读取
 */
export function getAudioSettings(): Partial<AudioSettings> {
  try {
    return getDatabase().getFormattedAudioConfig()
  }
  catch (error) {
    logger.error('获取音频设置失败:', error)
    return { ...DEFAULT_AUDIO_SETTINGS }
  }
}

/**
 * 更新音频 Settings：写 DB → runtime.reload()
 * 编解码参数变化时调用方仍需按需 rebuild Opus（IPC 路径已处理）
 */
export function updateAudioSettings(config: Partial<AudioSettings>): void {
  try {
    const dbUpdates = settingsToDbUpdates(config)
    if (Object.keys(dbUpdates).length === 0) {
      return
    }

    getDatabase().updateAudioConfig(dbUpdates)
    getAudioRuntime().reload()
    logger.info('音频设置已更新并 reload runtime:', dbUpdates)
  }
  catch (error) {
    logger.error('设置音频配置失败:', error)
  }
}

/**
 * @deprecated 使用 getAudioSettings()
 */
export function getAudioConfig(): Partial<AudioConfig> {
  return getAudioSettings()
}

/**
 * @deprecated 使用 updateAudioSettings()
 */
export function setAudioConfig(config: Partial<AudioConfig>): void {
  updateAudioSettings(config)
}
