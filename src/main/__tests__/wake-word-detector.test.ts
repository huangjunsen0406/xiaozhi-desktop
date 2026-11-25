import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { setImmediate as nextImmediate } from 'node:timers/promises'
import { WakeWordDetector } from '../wake-word/WakeWordDetector'

interface FakeStream {
  id: number
  accepted: number
  acceptWaveform: () => void
}

interface FakeSpotter {
  id: number
  streams: FakeStream[]
  decoded: number
  resetCount: number
  nextKeyword: string
  createStream: () => FakeStream
  isReady: (stream: FakeStream) => boolean
  decode: (stream: FakeStream) => void
  getResult: (stream: FakeStream) => { keyword: string }
  reset: (stream: FakeStream) => void
}

let spotters: FakeSpotter[]

beforeEach(() => {
  spotters = []
  Object.assign(globalThis, {
    __wakeWordTestRuntime: {
      createSpotter: (): FakeSpotter => {
        const id = spotters.length + 1
        const spotter: FakeSpotter = {
          id,
          streams: [],
          decoded: 0,
          resetCount: 0,
          nextKeyword: '',
          createStream: () => {
            const stream: FakeStream = {
              id: spotter.streams.length + 1,
              accepted: 0,
              acceptWaveform: () => {
                stream.accepted++
              },
            }
            spotter.streams.push(stream)
            return stream
          },
          isReady: () => true,
          decode: () => {
            spotter.decoded++
          },
          getResult: () => ({ keyword: spotter.nextKeyword }),
          reset: () => {
            spotter.resetCount++
          },
        }
        spotters.push(spotter)
        return spotter
      },
    },
  })
})

afterEach(() => {
  delete (globalThis as Record<string, unknown>).__wakeWordTestRuntime
})

describe('WakeWordDetector', () => {
  it('detects wake words with cooldown enforcement', async () => {
    const detector = new WakeWordDetector({
      language: 'zh',
      modelsBasePath: '/tmp/models',
    })
    detector.setCooldown(1000)

    const detected: string[] = []
    detector.onDetected(keyword => detected.push(keyword))
    spotters[0].nextKeyword = '你好小智'

    detector.onAudioData(new Int16Array(320))
    detector.onAudioData(new Int16Array(320))
    await nextImmediate()

    assert.deepEqual(detected, ['你好小智'])
    assert.equal(spotters[0].resetCount, 2)
    detector.shutdown()
  })

  it('cancels queued setImmediate processing cleanly on reload without hanging', async () => {
    const detector = new WakeWordDetector({
      language: 'zh',
      modelsBasePath: '/tmp/models',
    })
    assert.equal(spotters.length, 1)

    // Queue audio data (schedules setImmediate), then immediately reload before setImmediate runs
    detector.onAudioData(new Int16Array(320))
    detector.reload({
      language: 'en',
      modelsBasePath: '/tmp/models',
    })

    // Reload should synchronously create the second spotter without waiting on a 50ms retry loop
    assert.equal(spotters.length, 2)
    assert.equal(detector.isEnabled(), true)

    await nextImmediate()
    // Old spotter must not have processed the cancelled frame
    assert.equal(spotters[0].streams[0].accepted, 0)

    // New spotter works normally after reload
    const detected: string[] = []
    detector.onDetected(keyword => detected.push(keyword))
    spotters[1].nextKeyword = 'hello moss'
    detector.onAudioData(new Int16Array(320))
    await nextImmediate()

    assert.deepEqual(detected, ['hello moss'])
    assert.equal(spotters[1].streams[0].accepted, 1)
    detector.shutdown()
  })

  it('cancels queued processing on shutdown and drops subsequent frames', async () => {
    const detector = new WakeWordDetector({
      language: 'zh',
      modelsBasePath: '/tmp/models',
    })

    detector.onAudioData(new Int16Array(320))
    detector.shutdown()
    assert.equal(detector.isEnabled(), false)

    detector.onAudioData(new Int16Array(320))
    await nextImmediate()
    assert.equal(spotters[0].streams[0].accepted, 0)
  })
})
