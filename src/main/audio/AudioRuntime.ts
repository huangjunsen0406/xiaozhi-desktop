import type { ValidSampleRate } from '@shared/types'
import { getDatabase } from '../services/database'
import { getLogger } from '../utils/logger'

const logger = getLogger('AudioRuntime')

const VALID_RATES: readonly number[] = [8000, 12000, 16000, 24000, 48000]

function isValidRate(rate: number): rate is ValidSampleRate {
  return VALID_RATES.includes(rate)
}

/**
 * 编解码 / hello 用的运行时音频参数（非用户偏好 DTO）
 */
export interface AudioRuntimeParams {
  inputSampleRate: ValidSampleRate
  outputSampleRate: ValidSampleRate
  channels: number
  frameDuration: number
}

/**
 * 协议 hello 的 uplink 快照（与 Opus 编码器同源）
 */
export interface AudioUplinkParams {
  format: 'opus'
  sample_rate: number
  channels: number
  frame_duration: number
}

/** @deprecated 使用 AudioRuntimeParams；保留兼容旧 import */
export type AudioParams = AudioRuntimeParams

const DEFAULT_PARAMS: AudioRuntimeParams = {
  inputSampleRate: 16000,
  outputSampleRate: 24000,
  channels: 1,
  frameDuration: 20,
}

function loadParamsFromDb(): AudioRuntimeParams {
  try {
    const db = getDatabase()
    const dbConfig = db.getFormattedAudioConfig()

    return {
      inputSampleRate: isValidRate(dbConfig.inputSampleRate) ? dbConfig.inputSampleRate : DEFAULT_PARAMS.inputSampleRate,
      outputSampleRate: isValidRate(dbConfig.outputSampleRate) ? dbConfig.outputSampleRate : DEFAULT_PARAMS.outputSampleRate,
      channels: dbConfig.channels || DEFAULT_PARAMS.channels,
      frameDuration: dbConfig.frameDuration || DEFAULT_PARAMS.frameDuration,
    }
  }
  catch (error) {
    logger.warn('使用默认音频运行时参数', error)
    return { ...DEFAULT_PARAMS }
  }
}

/**
 * 音频运行时（Pipeline 参数面）
 *
 * 显式生命周期：initializeAudioRuntime → getAudioRuntime → reload / resetAudioRuntime
 * 禁止 `export const new` 模块单例作为唯一 API。
 *
 * 依赖方向：UI → Settings → Runtime → Protocol / Codec
 */
export class AudioRuntime {
  private params: AudioRuntimeParams

  /** Created by initializeAudioRuntime(); use getAudioRuntime() in business code. */
  constructor(params?: AudioRuntimeParams) {
    this.params = params ? { ...params } : loadParamsFromDb()
  }

  /**
   * 从 DB/settings 重载运行时参数（设置变更后调用）
   */
  reload(): void {
    this.params = loadParamsFromDb()
    logger.info('音频运行时参数已重新加载:', this.params)
  }

  /**
   * 协议 hello 用的 uplink 快照（与 Opus 同源）
   */
  getUplinkParams(): AudioUplinkParams {
    return {
      format: 'opus',
      sample_rate: this.params.inputSampleRate,
      channels: this.params.channels,
      frame_duration: this.params.frameDuration,
    }
  }

  /** 当前参数快照（只读拷贝） */
  getParams(): AudioRuntimeParams {
    return { ...this.params }
  }

  get inputSampleRate(): ValidSampleRate {
    return this.params.inputSampleRate
  }

  get outputSampleRate(): ValidSampleRate {
    return this.params.outputSampleRate
  }

  get channels(): number {
    return this.params.channels
  }

  get frameDuration(): number {
    return this.params.frameDuration
  }

  get inputFrameSize(): number {
    return Math.floor(this.params.inputSampleRate * (this.params.frameDuration / 1000))
  }

  get outputFrameSize(): number {
    return Math.floor(this.params.outputSampleRate * (this.params.frameDuration / 1000))
  }
}

let _audioRuntime: AudioRuntime | null = null

/**
 * 显式初始化音频运行时（依赖已 initializeDatabase）
 */
export function initializeAudioRuntime(params?: AudioRuntimeParams): AudioRuntime {
  if (_audioRuntime) {
    return _audioRuntime
  }
  _audioRuntime = new AudioRuntime(params)
  logger.info('AudioRuntime 已初始化:', _audioRuntime.getParams())
  return _audioRuntime
}

/**
 * 获取已初始化的音频运行时；未 initializeAudioRuntime 则抛错
 */
export function getAudioRuntime(): AudioRuntime {
  if (!_audioRuntime) {
    throw new Error(
      'AudioRuntime not initialized. Call initializeAudioRuntime() during app bootstrap before getAudioRuntime().',
    )
  }
  return _audioRuntime
}

/**
 * 重置音频运行时引用（仅测试用）
 */
export function resetAudioRuntime(): void {
  _audioRuntime = null
}
