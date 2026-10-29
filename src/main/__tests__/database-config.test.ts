import type { DbAudioSettings, DbWakeWordConfig } from '../types/database'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DatabaseManager } from '../services/database'

function configurationReader(audio: DbAudioSettings, wakeWord?: DbWakeWordConfig): DatabaseManager {
  // 只测试真实读取转换，不打开 SQLite 或创建用户数据。
  const database = Object.create(DatabaseManager.prototype) as DatabaseManager
  database.getOrCreateAudioSettings = () => audio
  database.getOrCreateWakeWordConfig = () => {
    assert.ok(wakeWord)
    return wakeWord
  }
  return database
}

const audioRow: DbAudioSettings = {
  id: 1,
  input_device_name: null,
  output_device_name: null,
  enable_noise_reduction: 1,
  enable_echo_cancellation: 1,
  aec_mode: 'app',
  conversation_mode: 'auto',
  input_sample_rate: 16000,
  output_sample_rate: 24000,
  channels: 1,
  frame_duration: 20,
  created_at: 0,
  updated_at: 0,
}

describe('stored configuration normalization', () => {
  it('uses the runtime audio rules when stored values are invalid', () => {
    const database = configurationReader({
      ...audioRow,
      input_sample_rate: -1,
      output_sample_rate: Number.NaN,
      channels: -1,
      frame_duration: 0,
      conversation_mode: 'legacy-invalid',
      aec_mode: null,
      enable_echo_cancellation: 0,
    })
    assert.deepEqual(database.getFormattedAudioSettings(), {
      inputDeviceName: undefined,
      outputDeviceName: undefined,
      enableNoiseReduction: true,
      enableEchoCancellation: false,
      aecMode: 'off',
      conversationMode: 'auto',
      inputSampleRate: 16000,
      outputSampleRate: 24000,
      channels: 1,
      frameDuration: 20,
    })
  })

  it('preserves supported stereo and fractional Opus frame durations', () => {
    const database = configurationReader({ ...audioRow, channels: 2, frame_duration: 2.5, input_sample_rate: 48000 })
    const settings = database.getFormattedAudioSettings()
    assert.equal(settings.channels, 2)
    assert.equal(settings.frameDuration, 2.5)
    assert.equal(settings.inputSampleRate, 48000)
  })

  it('preserves explicit zero wake-word scores and cooldown', () => {
    const database = configurationReader(audioRow, {
      id: 1,
      enabled: 1,
      language: 'zh',
      keyword_zh: '你好小智',
      keyword_en: '',
      threshold: 0,
      score: 0,
      cooldown_ms: 0,
      greet: 0,
      created_at: 0,
      updated_at: 0,
    })
    const settings = database.getFormattedWakeWordConfig()
    assert.equal(settings.threshold, 0)
    assert.equal(settings.score, 0)
    assert.equal(settings.cooldownMs, 0)
  })
})
