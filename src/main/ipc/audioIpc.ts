import type {
  AecCaptureReport,
  AecMode,
  AecStatus,
  AudioSettings,
  AudioUpdateSettingsResult,
} from '@shared/types'
import process from 'node:process'
import { BrowserWindow } from 'electron'
import {
  aecModeFromLegacyEchoFlag,
  legacyEchoFlagFromAecMode,
  normalizeAecMode,
  readAecBootMode,
  writeAecBootMode,
} from '../audio/AecPolicy'
import { getAudioRuntime } from '../audio/AudioRuntime'
import { OpusCodec } from '../audio/OpusCodec'
import { getDatabase } from '../services/database'
import {
  classifyAudioSettingsDiff,
  reconnectIfConnectedKeepingIdle,
} from '../services/settingsApply'
import { getLogger } from '../utils/logger'
import { SystemVolumeController } from '../utils/SystemVolumeController'
import { createIpcHandler, failure, success } from './middleware'

const logger = getLogger('AudioIpc')

// Opus 编解码器实例
let opusCodec: OpusCodec | null = null

// 系统音量控制器实例
const systemVolumeController = new SystemVolumeController()

/** 采集窗最近一次上报的 track EC 状态 */
let lastCaptureEchoApplied: boolean | undefined

const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  enableNoiseReduction: true,
  enableEchoCancellation: true,
  aecMode: 'app',
  conversationMode: 'auto',
}

function resolveAecModeFromPartial(
  config: Partial<AudioSettings>,
  previousMode: AecMode,
): AecMode | undefined {
  if (config.aecMode !== undefined)
    return normalizeAecMode(config.aecMode, previousMode)
  if ('enableEchoCancellation' in config && config.aecMode === undefined)
    return aecModeFromLegacyEchoFlag(config.enableEchoCancellation)
  return undefined
}

/**
 * 将 settings partial 映射为 DB 列更新
 */
function settingsToDbUpdates(
  config: Partial<AudioSettings>,
  previousMode: AecMode = 'app',
): Record<string, unknown> {
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

  const nextMode = resolveAecModeFromPartial(config, previousMode)
  if (nextMode !== undefined) {
    dbUpdates.aec_mode = nextMode
    dbUpdates.enable_echo_cancellation = legacyEchoFlagFromAecMode(nextMode)
  }
  else if ('enableEchoCancellation' in config) {
    // 仅旧字段且上面未解析到 mode 时（不应发生）；兜底双写
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

function notifyBackgroundAudio(command: string): void {
  const windows = BrowserWindow.getAllWindows()
  windows.forEach((win) => {
    if (win.isDestroyed())
      return
    const url = win.webContents.getURL()
    if (url.includes('audio.html') || url.includes('#/audio')) {
      win.webContents.send('audio:command', command)
    }
  })
}

/**
 * 合并 previous 与 partial 为「保存后的期望快照」用于值 diff。
 * aecMode / legacy 布尔按 resolve 规则归一。
 */
function mergeAudioSettingsSnapshot(
  previous: AudioSettings,
  partial: Partial<AudioSettings>,
): AudioSettings {
  const merged: AudioSettings = { ...previous, ...partial }
  // 若 partial 只带 legacy 布尔，确保 aecMode 与之一致，便于 classify
  if ('enableEchoCancellation' in partial && partial.aecMode === undefined) {
    merged.aecMode = aecModeFromLegacyEchoFlag(partial.enableEchoCancellation)
  }
  if (partial.aecMode !== undefined) {
    merged.aecMode = normalizeAecMode(partial.aecMode, previous.aecMode ?? 'app')
    merged.enableEchoCancellation = legacyEchoFlagFromAecMode(merged.aecMode)
  }
  return merged
}

function buildAecStatus(): AecStatus {
  const formatted = getDatabase().getFormattedAudioSettings()
  const desired = normalizeAecMode(formatted.aecMode, 'app')
  const bootMode = readAecBootMode()
  const platform = process.platform

  let effective: AecStatus['effective']
  let reason: string | undefined
  const requiresRelaunch = desired === 'system' && bootMode !== 'system'

  if (desired === 'off') {
    effective = 'off'
  }
  else if (desired === 'system') {
    if (bootMode !== 'system') {
      effective = 'app_fallback'
      reason = 'system_features_need_relaunch'
    }
    else if (lastCaptureEchoApplied === false) {
      effective = 'unavailable'
      reason = 'track_echo_cancellation_false'
    }
    else {
      effective = 'system'
    }
  }
  else {
    // app
    if (lastCaptureEchoApplied === false) {
      effective = 'unavailable'
      reason = 'track_echo_cancellation_false'
    }
    else {
      effective = 'app'
    }
  }

  return {
    desired,
    effective,
    reason,
    echoCancellationApplied: lastCaptureEchoApplied,
    platform,
    requiresRelaunch,
  }
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
      const config = db.getFormattedAudioSettings()
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
      const previous = db.getFormattedAudioSettings()
      const previousMode = normalizeAecMode(previous.aecMode, 'app')
      const dbUpdates = settingsToDbUpdates(config, previousMode)

      // 按值 diff（UI 常全量提交；禁止「有 key 即 codec 变更 → 误重连」）
      const expectedNext = mergeAudioSettingsSnapshot(previous, config)
      const plan = classifyAudioSettingsDiff(previous, expectedNext)

      db.updateAudioSettings(dbUpdates)
      logger.info('音频设置已保存到数据库:', dbUpdates)

      const nextFormatted = db.getFormattedAudioSettings()
      const nextMode = normalizeAecMode(nextFormatted.aecMode, 'app')
      writeAecBootMode(nextMode)

      // Settings → Runtime：写 DB 后统一 reload（廉价；编解码热路径再 rebuild）
      getAudioRuntime().reload()

      let codecRebuilt = false
      let deviceSwitched = false
      let captureReinitialized = false
      let protocolReconnected = false

      if (plan.needsCodecRebuild) {
        const codec = getOpusCodec()
        if (codec) {
          codec.rebuild()
          codecRebuilt = true
          logger.info('✓ OpusCodec 已根据新配置重建')
        }
      }

      if (plan.audioWindowAction === 'reinitialize') {
        notifyBackgroundAudio('reinitialize')
        captureReinitialized = true
        logger.info('✓ 已通知后台音频窗口 reinitialize（codec/AEC/NS）')
      }
      else if (plan.audioWindowAction === 'switchDevices') {
        notifyBackgroundAudio('switchDevices')
        deviceSwitched = true
        logger.info('✓ 已通知后台音频窗口 switchDevices（仅设备）')
      }

      if (plan.needsProtocolReconnect) {
        try {
          protocolReconnected = await reconnectIfConnectedKeepingIdle()
        }
        catch (error) {
          logger.error('编解码参数变化后协议重连失败（不影响音频重建）:', error)
        }
      }
      else if (plan.devicesChanged || plan.processingChanged || plan.conversationModeChanged) {
        logger.info('跳过协议重连（设备/AEC/NS/会话模式不进 hello audio_params）')
      }

      if (plan.requiresRelaunch) {
        logger.info('AEC system 启动 feature 交叉，需重启应用完整生效')
      }

      const result: AudioUpdateSettingsResult = {
        requiresRelaunch: plan.requiresRelaunch,
        aecMode: nextMode,
        aecStatus: buildAecStatus(),
        deviceSwitched,
        captureReinitialized,
        codecRebuilt,
        protocolReconnected,
        applied: {
          devicesChanged: plan.devicesChanged,
          codecParamsChanged: plan.codecParamsChanged,
          processingChanged: plan.processingChanged,
          conversationModeChanged: plan.conversationModeChanged,
          audioWindowAction: plan.audioWindowAction,
        },
      }
      return success(result)
    },
  })

  createIpcHandler({
    channel: 'audio:get-aec-status',
    verbose: false,
    handler: async () => {
      return success(buildAecStatus())
    },
  })

  createIpcHandler({
    channel: 'audio:report-aec-capture',
    verbose: false,
    schema: {
      payload: { type: 'object', required: true },
    },
    handler: async (_event, ...args) => {
      const payload = args[0] as AecCaptureReport
      if (typeof payload.echoCancellationApplied === 'boolean') {
        lastCaptureEchoApplied = payload.echoCancellationApplied
      }
      return success(buildAecStatus())
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

      const config = db.getFormattedAudioSettings()

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
    return getDatabase().getFormattedAudioSettings()
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
    const db = getDatabase()
    const previousMode = normalizeAecMode(db.getFormattedAudioSettings().aecMode, 'app')
    const dbUpdates = settingsToDbUpdates(config, previousMode)
    if (Object.keys(dbUpdates).length === 0) {
      return
    }

    db.updateAudioSettings(dbUpdates)
    const nextMode = normalizeAecMode(db.getFormattedAudioSettings().aecMode, 'app')
    writeAecBootMode(nextMode)
    getAudioRuntime().reload()
    logger.info('音频设置已更新并 reload runtime:', dbUpdates)
  }
  catch (error) {
    logger.error('设置音频配置失败:', error)
  }
}
