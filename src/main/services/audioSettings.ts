import type { AecCaptureReport, AecMode, AecStatus, AudioSettings, AudioUpdateSettingsResult } from '@shared/types'
import type { DbAudioSettingsPatch } from '../types/database'
import process from 'node:process'
import { BrowserWindow } from 'electron'
import { aecModeFromLegacyEchoFlag, legacyEchoFlagFromAecMode, normalizeAecMode, readAecBootMode, writeAecBootMode } from '../audio/AecPolicy'
import { getAudioRuntime } from '../audio/AudioRuntime'
import { getOpusCodec } from '../audio/codecService'
import { getLogger } from '../utils/logger'
import { getDatabase } from './database'
import { classifyAudioSettingsDiff, reconnectIfConnectedKeepingIdle } from './settingsApply'

const logger = getLogger('AudioSettings')
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
): DbAudioSettingsPatch {
  const dbUpdates: DbAudioSettingsPatch = {}

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

export function getAecStatus(): AecStatus {
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

/** 唯一设置应用入口：落盘、重载、媒体重建与必要重连。 */
export async function applyAudioSettings(config: Partial<AudioSettings>): Promise<AudioUpdateSettingsResult> {
  const db = getDatabase()
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
    aecStatus: getAecStatus(),
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
  return result
}

export function reportAecCapture(payload: AecCaptureReport): AecStatus {
  if (payload.echoCancellationApplied !== undefined)
    lastCaptureEchoApplied = payload.echoCancellationApplied
  return getAecStatus()
}

export function getAudioSettings(): AudioSettings {
  try {
    return getDatabase().getFormattedAudioSettings()
  }
  catch (error) {
    logger.warn('获取音频设置失败，使用默认偏好', error)
    return { ...DEFAULT_AUDIO_SETTINGS }
  }
}
