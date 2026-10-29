import type { AudioSettings, ValidSampleRate } from '@shared/types'

export const AUDIO_SAMPLE_RATES = [8000, 12000, 16000, 24000, 48000] as const
const FRAME_DURATIONS = [2.5, 5, 10, 20, 40, 60]

export function isAudioSampleRate(value: unknown): value is ValidSampleRate {
  return typeof value === 'number' && (AUDIO_SAMPLE_RATES as readonly number[]).includes(value)
}

export function isAudioChannels(value: unknown): value is 1 | 2 {
  return value === 1 || value === 2
}

export function isAudioFrameDuration(value: unknown): value is number {
  return typeof value === 'number' && FRAME_DURATIONS.includes(value)
}

/** 只解析可写偏好；系统音量通过独立音量命令设置。 */
export function parseAudioSettingsUpdate(value: unknown): Partial<AudioSettings> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('音频配置必须是对象')
  const input = value as Record<string, unknown>
  const result: Partial<AudioSettings> = {}

  for (const key of ['inputDeviceName', 'outputDeviceName'] as const) {
    if (input[key] === undefined)
      continue
    if (typeof input[key] !== 'string')
      throw new Error(`${key} 必须是字符串`)
    result[key] = input[key]
  }
  for (const key of ['enableNoiseReduction', 'enableEchoCancellation'] as const) {
    if (input[key] === undefined)
      continue
    if (typeof input[key] !== 'boolean')
      throw new Error(`${key} 必须是布尔值`)
    result[key] = input[key]
  }
  for (const key of ['inputSampleRate', 'outputSampleRate'] as const) {
    if (input[key] === undefined)
      continue
    if (!isAudioSampleRate(input[key]))
      throw new Error(`${key} 不是支持的 Opus 采样率`)
    result[key] = input[key]
  }
  if (input.channels !== undefined) {
    if (!isAudioChannels(input.channels))
      throw new Error('channels 必须是 1 或 2')
    result.channels = input.channels
  }
  if (input.frameDuration !== undefined) {
    if (!isAudioFrameDuration(input.frameDuration))
      throw new Error('frameDuration 不是支持的 Opus 帧时长')
    result.frameDuration = input.frameDuration
  }
  if (input.aecMode !== undefined) {
    if (input.aecMode !== 'off' && input.aecMode !== 'app' && input.aecMode !== 'system')
      throw new Error('aecMode 必须是 off、app 或 system')
    result.aecMode = input.aecMode
  }
  if (input.conversationMode !== undefined) {
    if (input.conversationMode !== 'auto' && input.conversationMode !== 'realtime')
      throw new Error('conversationMode 必须是 auto 或 realtime')
    result.conversationMode = input.conversationMode
  }
  return result
}
