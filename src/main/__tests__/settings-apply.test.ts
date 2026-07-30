/**
 * settingsApply 纯函数单测
 * 运行：npx tsx --test src/main/__tests__/settings-apply.test.ts
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { AudioSettings } from '@shared/types'

describe('settingsApply', () => {
  it('device-only change → switchDevices, no protocol reconnect', async () => {
    const { classifyAudioSettingsDiff } = await import('../services/settingsApply')
    const previous: AudioSettings = {
      inputDeviceName: 'Mic A',
      outputDeviceName: 'Speaker A',
      enableNoiseReduction: true,
      aecMode: 'app',
      enableEchoCancellation: true,
      conversationMode: 'auto',
      inputSampleRate: 16000,
      outputSampleRate: 24000,
      channels: 1,
      frameDuration: 20,
    }
    const next: AudioSettings = {
      ...previous,
      inputDeviceName: 'Mic B',
    }
    const plan = classifyAudioSettingsDiff(previous, next)
    assert.equal(plan.devicesChanged, true)
    assert.equal(plan.codecParamsChanged, false)
    assert.equal(plan.processingChanged, false)
    assert.equal(plan.needsDeviceSwitch, true)
    assert.equal(plan.needsCaptureReinit, false)
    assert.equal(plan.needsCodecRebuild, false)
    assert.equal(plan.needsProtocolReconnect, false)
    assert.equal(plan.requiresRelaunch, false)
    assert.equal(plan.audioWindowAction, 'switchDevices')
  })

  it('codec params → rebuild + protocol reconnect, reinitialize', async () => {
    const { classifyAudioSettingsDiff } = await import('../services/settingsApply')
    const previous: AudioSettings = {
      aecMode: 'app',
      inputSampleRate: 16000,
      outputSampleRate: 24000,
      channels: 1,
      frameDuration: 20,
    }
    const next: AudioSettings = {
      ...previous,
      inputSampleRate: 24000,
    }
    const plan = classifyAudioSettingsDiff(previous, next)
    assert.equal(plan.codecParamsChanged, true)
    assert.equal(plan.needsCodecRebuild, true)
    assert.equal(plan.needsProtocolReconnect, true)
    assert.equal(plan.needsCaptureReinit, true)
    assert.equal(plan.audioWindowAction, 'reinitialize')
    assert.equal(plan.needsDeviceSwitch, false)
  })

  it('AEC off↔app → capture reinit only, no reconnect / relaunch', async () => {
    const { classifyAudioSettingsDiff } = await import('../services/settingsApply')
    const previous: AudioSettings = {
      aecMode: 'app',
      enableEchoCancellation: true,
      enableNoiseReduction: true,
      inputSampleRate: 16000,
    }
    const next: AudioSettings = {
      ...previous,
      aecMode: 'off',
      enableEchoCancellation: false,
    }
    const plan = classifyAudioSettingsDiff(previous, next)
    assert.equal(plan.processingChanged, true)
    assert.equal(plan.needsCaptureReinit, true)
    assert.equal(plan.needsProtocolReconnect, false)
    assert.equal(plan.needsCodecRebuild, false)
    assert.equal(plan.requiresRelaunch, false)
    assert.equal(plan.audioWindowAction, 'reinitialize')
  })

  it('AEC app→system → requiresRelaunch + capture reinit, no protocol reconnect', async () => {
    const { classifyAudioSettingsDiff } = await import('../services/settingsApply')
    const previous: AudioSettings = { aecMode: 'app' }
    const next: AudioSettings = { aecMode: 'system' }
    const plan = classifyAudioSettingsDiff(previous, next)
    assert.equal(plan.requiresRelaunch, true)
    assert.equal(plan.needsCaptureReinit, true)
    assert.equal(plan.needsProtocolReconnect, false)
    assert.equal(plan.nextAecMode, 'system')
  })

  it('noise reduction only → processing reinit, no reconnect', async () => {
    const { classifyAudioSettingsDiff } = await import('../services/settingsApply')
    const previous: AudioSettings = {
      enableNoiseReduction: true,
      aecMode: 'app',
    }
    const next: AudioSettings = {
      enableNoiseReduction: false,
      aecMode: 'app',
    }
    const plan = classifyAudioSettingsDiff(previous, next)
    assert.equal(plan.processingChanged, true)
    assert.equal(plan.needsProtocolReconnect, false)
    assert.equal(plan.audioWindowAction, 'reinitialize')
  })

  it('conversationMode only → no audio side effects', async () => {
    const { classifyAudioSettingsDiff } = await import('../services/settingsApply')
    const previous: AudioSettings = {
      conversationMode: 'auto',
      aecMode: 'app',
      inputSampleRate: 16000,
    }
    const next: AudioSettings = {
      ...previous,
      conversationMode: 'realtime',
    }
    const plan = classifyAudioSettingsDiff(previous, next)
    assert.equal(plan.conversationModeChanged, true)
    assert.equal(plan.devicesChanged, false)
    assert.equal(plan.codecParamsChanged, false)
    assert.equal(plan.processingChanged, false)
    assert.equal(plan.needsDeviceSwitch, false)
    assert.equal(plan.needsCaptureReinit, false)
    assert.equal(plan.needsCodecRebuild, false)
    assert.equal(plan.needsProtocolReconnect, false)
    assert.equal(plan.audioWindowAction, 'none')
  })

  it('combined device + codec → max of needs (reinit + reconnect, not switchDevices only)', async () => {
    const { classifyAudioSettingsDiff } = await import('../services/settingsApply')
    const previous: AudioSettings = {
      inputDeviceName: 'A',
      inputSampleRate: 16000,
      aecMode: 'app',
    }
    const next: AudioSettings = {
      inputDeviceName: 'B',
      inputSampleRate: 48000,
      aecMode: 'app',
    }
    const plan = classifyAudioSettingsDiff(previous, next)
    assert.equal(plan.devicesChanged, true)
    assert.equal(plan.codecParamsChanged, true)
    assert.equal(plan.needsCodecRebuild, true)
    assert.equal(plan.needsProtocolReconnect, true)
    // 编解码优先于仅设备：reinitialize 覆盖 switchDevices
    assert.equal(plan.audioWindowAction, 'reinitialize')
    assert.equal(plan.needsDeviceSwitch, false)
  })

  it('full UI payload with unchanged values → no side effects', async () => {
    const { classifyAudioSettingsDiff } = await import('../services/settingsApply')
    const snapshot: AudioSettings = {
      inputDeviceName: 'Built-in Mic',
      outputDeviceName: 'Built-in Output',
      enableNoiseReduction: true,
      aecMode: 'app',
      enableEchoCancellation: true,
      conversationMode: 'auto',
      inputSampleRate: 16000,
      outputSampleRate: 24000,
      channels: 1,
      frameDuration: 20,
    }
    // 模拟设置页「全量提交」但用户未改任何项
    const plan = classifyAudioSettingsDiff(snapshot, { ...snapshot })
    assert.equal(plan.devicesChanged, false)
    assert.equal(plan.codecParamsChanged, false)
    assert.equal(plan.processingChanged, false)
    assert.equal(plan.needsProtocolReconnect, false)
    assert.equal(plan.audioWindowAction, 'none')
  })

  it('legacy enableEchoCancellation false maps to off processing change', async () => {
    const { classifyAudioSettingsDiff, resolveAecModeFromSettings } = await import(
      '../services/settingsApply'
    )
    assert.equal(resolveAecModeFromSettings({ enableEchoCancellation: false }), 'off')
    assert.equal(resolveAecModeFromSettings({ enableEchoCancellation: true }), 'app')

    const previous: AudioSettings = {
      aecMode: 'app',
      enableEchoCancellation: true,
    }
    const next: AudioSettings = {
      enableEchoCancellation: false,
    }
    const plan = classifyAudioSettingsDiff(previous, next)
    assert.equal(plan.nextAecMode, 'off')
    assert.equal(plan.processingChanged, true)
    assert.equal(plan.needsProtocolReconnect, false)
  })
})
