import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseAudioSettingsUpdate } from '../audio/audioSettingsValidation'

describe('audio settings update boundary', () => {
  it('accepts supported codec values and preserves legacy false flags', () => {
    assert.deepEqual(parseAudioSettingsUpdate({
      inputSampleRate: 12000,
      outputSampleRate: 48000,
      channels: 2,
      frameDuration: 2.5,
      enableEchoCancellation: false,
      enableNoiseReduction: false,
      conversationMode: 'realtime',
      inputDeviceName: '',
    }), {
      inputDeviceName: '',
      enableEchoCancellation: false,
      enableNoiseReduction: false,
      inputSampleRate: 12000,
      outputSampleRate: 48000,
      channels: 2,
      frameDuration: 2.5,
      conversationMode: 'realtime',
    })
  })

  it('rejects invalid codec numbers before they can be persisted or rebuilt', () => {
    for (const invalid of [
      { channels: -1 },
      { channels: 1.5 },
      { channels: Number.NaN },
      { frameDuration: -20 },
      { frameDuration: Number.POSITIVE_INFINITY },
      { inputSampleRate: 44100 },
      { outputSampleRate: Number.NaN },
    ]) {
      assert.throws(() => parseAudioSettingsUpdate(invalid))
    }
  })

  it('validates enums and primitive fields while dropping non-writable keys', () => {
    for (const invalid of [
      [],
      null,
      { aecMode: 'unexpected' },
      { conversationMode: 'manual' },
      { enableNoiseReduction: 'false' },
      { inputDeviceName: 42 },
    ]) {
      assert.throws(() => parseAudioSettingsUpdate(invalid))
    }
    assert.deepEqual(parseAudioSettingsUpdate({ aecMode: 'system', updated_at: 123, speakerVolume: 90 }), { aecMode: 'system' })
  })
})
