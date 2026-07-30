/**
 * 设置变更分级应用（Settings apply matrix）
 *
 * P0 写 DB（调用方负责）
 * L1 本地媒体：设备切换 / 采集重建（gUM 约束）
 * L2 AudioRuntime + OpusCodec.rebuild + 音频窗 reinitialize
 * L3 协议重连（hello audio_params / MCP 工具集）
 * L4 进程重启（AEC system forced_on 交叉）
 *
 * 关键规则：
 * - 仅设备变更：L1 switchDevices，禁止协议重连
 * - 采样率/声道/帧长：L1+L2+L3（已连接时）
 * - 降噪 / AEC off↔app：L1 reinit，不重连
 * - AEC 跨越 system：L1 + L4 requiresRelaunch
 * - conversationMode：无音频副作用
 * - MCP 工具禁用：L3（已连接时）— 见 reconnectIfConnectedKeepingIdle
 *
 * 纯分类函数不依赖 ServiceContainer，便于 tsx 单测。
 */

import type { AecMode, AudioSettings } from '@shared/types'
import {
  aecModeFromLegacyEchoFlag,
  normalizeAecMode,
  requiresRelaunchForAecMode,
} from '../audio/AecPolicy'
import { getLogger } from '../utils/logger'

const logger = getLogger('SettingsApply')

export type AudioWindowAction = 'none' | 'switchDevices' | 'reinitialize'

/**
 * 音频设置 diff 分类结果（纯数据，无副作用）
 */
export interface AudioSettingsApplyPlan {
  /** 输入/输出设备名是否变化 */
  devicesChanged: boolean
  /** 采样率 / 声道 / 帧长 */
  codecParamsChanged: boolean
  /** 降噪或 aecMode（含 legacy 布尔） */
  processingChanged: boolean
  conversationModeChanged: boolean

  /** L1：仅设备 → switchDevices */
  needsDeviceSwitch: boolean
  /** L1：AEC/NS 或编解码参数 → 音频窗 reinitialize */
  needsCaptureReinit: boolean
  /** L2：OpusCodec.rebuild */
  needsCodecRebuild: boolean
  /** L3：协议重连（仅 codec 参数；MCP 另路径） */
  needsProtocolReconnect: boolean
  /** L4：AEC system forced_on 交叉 */
  requiresRelaunch: boolean

  /** 后台音频窗应执行的命令（互斥，取最强） */
  audioWindowAction: AudioWindowAction

  previousAecMode: AecMode
  nextAecMode: AecMode
}

export interface AudioSettingsApplyResult {
  requiresRelaunch: boolean
  aecMode: AecMode
  deviceSwitched: boolean
  captureReinitialized: boolean
  codecRebuilt: boolean
  /** 尝试了协议重连且此前通道是打开的 */
  protocolReconnected: boolean
  plan: AudioSettingsApplyPlan
}

function normalizeDeviceName(value: string | null | undefined): string {
  return (value ?? '').trim()
}

/**
 * 从 settings 快照解析 aecMode（优先 aecMode，否则 legacy 布尔）
 */
export function resolveAecModeFromSettings(
  settings: Partial<AudioSettings> | null | undefined,
  fallback: AecMode = 'app',
): AecMode {
  if (!settings)
    return fallback
  if (settings.aecMode !== undefined)
    return normalizeAecMode(settings.aecMode, fallback)
  if ('enableEchoCancellation' in settings)
    return aecModeFromLegacyEchoFlag(settings.enableEchoCancellation)
  return fallback
}

/**
 * 比较前后完整（或足够字段的）音频设置，产出分级 apply plan。
 * 按**值** diff，避免 UI 全量提交时误判「有 key 即变更」。
 */
export function classifyAudioSettingsDiff(
  previous: Partial<AudioSettings>,
  next: Partial<AudioSettings>,
): AudioSettingsApplyPlan {
  const previousAecMode = resolveAecModeFromSettings(previous, 'app')
  const nextAecMode = resolveAecModeFromSettings(next, previousAecMode)

  const devicesChanged
    = normalizeDeviceName(previous.inputDeviceName) !== normalizeDeviceName(next.inputDeviceName)
      || normalizeDeviceName(previous.outputDeviceName) !== normalizeDeviceName(next.outputDeviceName)

  const codecParamsChanged
    = previous.inputSampleRate !== next.inputSampleRate
      || previous.outputSampleRate !== next.outputSampleRate
      || previous.channels !== next.channels
      || previous.frameDuration !== next.frameDuration

  const prevNoise = previous.enableNoiseReduction !== false
  const nextNoise = next.enableNoiseReduction !== false
  const noiseChanged = prevNoise !== nextNoise
  const aecChanged = previousAecMode !== nextAecMode
  const processingChanged = noiseChanged || aecChanged

  const conversationModeChanged
    = (previous.conversationMode ?? 'auto') !== (next.conversationMode ?? 'auto')

  const needsCodecRebuild = codecParamsChanged
  // 仅编解码参数进 hello audio_params → 需要重连；设备/AEC/会话模式不重连
  const needsProtocolReconnect = codecParamsChanged
  const requiresRelaunch = requiresRelaunchForAecMode(previousAecMode, nextAecMode)

  // 音频窗命令：编解码或处理选项 → 完整 reinitialize；仅设备 → switchDevices
  let audioWindowAction: AudioWindowAction = 'none'
  if (codecParamsChanged || processingChanged)
    audioWindowAction = 'reinitialize'
  else if (devicesChanged)
    audioWindowAction = 'switchDevices'

  return {
    devicesChanged,
    codecParamsChanged,
    processingChanged,
    conversationModeChanged,
    needsDeviceSwitch: audioWindowAction === 'switchDevices',
    needsCaptureReinit: audioWindowAction === 'reinitialize',
    needsCodecRebuild,
    needsProtocolReconnect,
    requiresRelaunch,
    audioWindowAction,
    previousAecMode,
    nextAecMode,
  }
}

/**
 * 若当前协议音频通道已打开，则 reload + reconnectKeepingIdle；
 * 未连接时仅 reload 内存配置，返回 false。
 *
 * MCP 工具禁用、编解码参数变更等共用此路径。
 * 动态 import ServiceContainer，避免纯函数单测拉起整棵主进程图。
 */
export async function reconnectIfConnectedKeepingIdle(): Promise<boolean> {
  const { getServiceContainer } = await import('../core/ServiceContainer')
  try {
    const container = getServiceContainer()
    const hadActiveChannel = container.isAudioChannelOpened()
    await container.reconnectProtocol()
    if (!hadActiveChannel) {
      logger.info('无活跃协议连接，已跳过重连（配置已 reload）')
      return false
    }
    const stillOpen = container.isAudioChannelOpened()
    if (stillOpen) {
      logger.info('协议已按 idle 策略重连')
      return true
    }
    logger.warn('协议重连后通道未打开')
    return false
  }
  catch (error) {
    logger.error('协议重连失败:', error)
    throw error
  }
}
