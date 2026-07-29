/**
 * AudioRuntime 显式生命周期单测
 *
 * 运行：npx tsx --test src/main/__tests__/audio-runtime.test.ts
 *
 * 不依赖 Electron / better-sqlite3：用显式 params 初始化，避免 DB。
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

describe('AudioRuntime lifecycle', () => {
  beforeEach(async () => {
    const { resetAudioRuntime } = await import('../audio/AudioRuntime')
    resetAudioRuntime()
  })

  afterEach(async () => {
    const { resetAudioRuntime } = await import('../audio/AudioRuntime')
    resetAudioRuntime()
  })

  it('getAudioRuntime throws when not initialized', async () => {
    const { getAudioRuntime } = await import('../audio/AudioRuntime')
    assert.throws(
      () => getAudioRuntime(),
      /AudioRuntime not initialized/,
    )
  })

  it('initialize then get returns same instance with params', async () => {
    const {
      initializeAudioRuntime,
      getAudioRuntime,
    } = await import('../audio/AudioRuntime')

    const created = initializeAudioRuntime({
      inputSampleRate: 16000,
      outputSampleRate: 24000,
      channels: 1,
      frameDuration: 20,
    })
    const got = getAudioRuntime()

    assert.equal(got, created)
    assert.equal(got.inputSampleRate, 16000)
    assert.equal(got.outputSampleRate, 24000)
    assert.equal(got.channels, 1)
    assert.equal(got.frameDuration, 20)
    assert.equal(got.inputFrameSize, 320)
    assert.equal(got.outputFrameSize, 480)
  })

  it('initialize is idempotent (second call returns first instance)', async () => {
    const { initializeAudioRuntime, getAudioRuntime } = await import('../audio/AudioRuntime')

    const first = initializeAudioRuntime({
      inputSampleRate: 16000,
      outputSampleRate: 24000,
      channels: 1,
      frameDuration: 20,
    })
    const second = initializeAudioRuntime({
      inputSampleRate: 48000,
      outputSampleRate: 48000,
      channels: 2,
      frameDuration: 40,
    })

    assert.equal(first, second)
    assert.equal(getAudioRuntime().inputSampleRate, 16000)
  })

  it('getUplinkParams shape matches protocol hello audio_params', async () => {
    const { initializeAudioRuntime, getAudioRuntime } = await import('../audio/AudioRuntime')

    initializeAudioRuntime({
      inputSampleRate: 16000,
      outputSampleRate: 24000,
      channels: 1,
      frameDuration: 20,
    })

    const uplink = getAudioRuntime().getUplinkParams()
    assert.deepEqual(uplink, {
      format: 'opus',
      sample_rate: 16000,
      channels: 1,
      frame_duration: 20,
    })
  })

  it('reload after init keeps runtime usable (explicit params path)', async () => {
    const { initializeAudioRuntime, getAudioRuntime } = await import('../audio/AudioRuntime')

    // 无 DB 时 loadParamsFromDb 走默认值；reload 仍应成功且不 throw
    initializeAudioRuntime({
      inputSampleRate: 8000,
      outputSampleRate: 12000,
      channels: 1,
      frameDuration: 40,
    })

    const rt = getAudioRuntime()
    assert.equal(rt.inputSampleRate, 8000)

    // reload 在无 DB 时回落到默认参数（或 throw 若 DB 层硬失败——此处仅断言不崩溃）
    // 使用 try/catch：若环境无 DB，load 返回 defaults
    rt.reload()
    const params = rt.getParams()
    assert.ok(typeof params.inputSampleRate === 'number')
    assert.ok(typeof params.outputSampleRate === 'number')
    assert.ok(typeof params.channels === 'number')
    assert.ok(typeof params.frameDuration === 'number')

    const uplink = rt.getUplinkParams()
    assert.equal(uplink.format, 'opus')
    assert.equal(uplink.sample_rate, params.inputSampleRate)
    assert.equal(uplink.channels, params.channels)
    assert.equal(uplink.frame_duration, params.frameDuration)
  })

  it('reset then get throws again', async () => {
    const {
      initializeAudioRuntime,
      getAudioRuntime,
      resetAudioRuntime,
    } = await import('../audio/AudioRuntime')

    initializeAudioRuntime({
      inputSampleRate: 16000,
      outputSampleRate: 24000,
      channels: 1,
      frameDuration: 20,
    })
    assert.ok(getAudioRuntime())

    resetAudioRuntime()
    assert.throws(
      () => getAudioRuntime(),
      /AudioRuntime not initialized/,
    )
  })
})
