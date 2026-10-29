import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { AudioCapture } from '../AudioCapture'
import { AudioCommandQueue } from '../AudioCommandQueue'
import { AudioPlayback } from '../AudioPlayback'

beforeEach(() => {
  mock.method(console, 'log', () => {})
  mock.method(console, 'error', () => {})
})
afterEach(() => mock.restoreAll())

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('audio power command queue', () => {
  it('serializes recovery, drops stale settings during sleep and keeps final cleanup terminal', async () => {
    const initializing = deferred<void>()
    const events: string[] = []
    const queue = new AudioCommandQueue(async (command) => {
      events.push(command)
      if (command === 'initialize')
        await initializing.promise
    }, error => assert.fail(String(error)))
    queue.enqueue('initialize')
    queue.enqueue('switchDevices')
    queue.enqueue('suspend')
    queue.enqueue('updateConfig')
    queue.enqueue('recover')
    initializing.resolve()
    await setImmediate()
    assert.deepEqual(events, ['initialize', 'suspend', 'recover'])
    queue.enqueue('cleanup')
    queue.enqueue('recover')
    await setImmediate()
    assert.deepEqual(events, ['initialize', 'suspend', 'recover', 'cleanup'])
  })

  it('reports failure once and permits the next explicit recovery without retries', async () => {
    let recoveries = 0
    let errors = 0
    const queue = new AudioCommandQueue(async () => {
      recoveries++
      if (recoveries === 1)
        throw new Error('device unavailable')
    }, () => { errors++ })
    queue.enqueue('recover')
    await setImmediate()
    assert.equal(recoveries, 1)
    assert.equal(errors, 1)
    queue.enqueue('recover')
    await setImmediate()
    assert.equal(recoveries, 2)
    assert.equal(errors, 1)
  })
})

class FakeSource {
  buffer: unknown
  onended: (() => void) | null = null
  stopped = false
  disconnected = false
  connect(): void {}
  disconnect(): void { this.disconnected = true }
  start(): void {}
  stop(): void { this.stopped = true }
}

class FakeContext {
  static instances: FakeContext[] = []
  static failResume = false
  static sinks: string[] = []
  state = 'running'
  sampleRate = 24000
  currentTime = 1
  destination = {}
  sources: FakeSource[] = []
  resumes = 0
  onstatechange: (() => void) | null = null
  audioWorklet = { addModule: async () => {} }

  createMediaStreamSource(): FakeSource {
    return new FakeSource()
  }

  constructor() { FakeContext.instances.push(this) }
  async resume(): Promise<void> {
    this.resumes++
    if (FakeContext.failResume)
      throw new Error('output unavailable')
    this.state = 'running'
  }

  async close(): Promise<void> { this.state = 'closed' }
  async setSinkId(id: string): Promise<void> { FakeContext.sinks.push(id) }
  createBuffer(_channels: number, length: number, rate: number) {
    return { duration: length / rate, getChannelData: () => new Float32Array(length) }
  }

  createBufferSource(): FakeSource {
    const source = new FakeSource()
    this.sources.push(source)
    return source
  }
}

describe('audio playback resource ownership', () => {
  it('drops sleep-time PCM, stops every scheduled source and recreates running OS handles on recovery', async () => {
    let receive: ((data: Uint8Array) => void) | undefined
    let subscriptions = 0
    let removed = 0
    Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: FakeContext })
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { api: {
        audioGetConfig: async () => ({ outputSampleRate: 24000, channels: 1 }),
        audioOnOpusDecoded: (listener: (data: Uint8Array) => void) => {
          receive = listener
          subscriptions++
          return () => {
            removed++
          }
        },
      } },
    })
    FakeContext.instances = []
    FakeContext.failResume = false
    const playback = new AudioPlayback()
    await playback.initialize()
    const first = FakeContext.instances[0]
    receive?.(new Uint8Array(960))
    assert.equal(first.sources.length, 0)
    playback.start()
    const resumes = first.resumes
    first.state = 'suspended'
    first.onstatechange?.()
    await setImmediate()
    assert.equal(first.resumes, resumes + 1)
    receive?.(new Uint8Array(960))
    receive?.(new Uint8Array(960))
    assert.equal(first.sources.length, 2)
    playback.stop()
    first.state = 'suspended'
    first.onstatechange?.()
    await setImmediate()
    assert.equal(first.resumes, resumes + 1)
    assert.equal(playback.getLatency(), 0)
    assert.ok(first.sources.every(source => source.stopped && source.disconnected))
    receive?.(new Uint8Array(960))
    assert.equal(first.sources.length, 2)
    await playback.initialize()
    assert.equal(first.state, 'closed')
    assert.equal(FakeContext.instances.length, 2)
    assert.equal(subscriptions - removed, 1)
    await playback.dispose()
    assert.equal(FakeContext.instances.length, 2)
    assert.equal(removed, subscriptions)
    assert.equal(FakeContext.instances[1].state, 'closed')

    FakeContext.failResume = true
    await assert.rejects(playback.initialize(), /output unavailable/)
    assert.equal(FakeContext.instances[2].state, 'closed')
    assert.equal(subscriptions, removed)
    FakeContext.failResume = false
    await playback.initialize()
    playback.start()
    assert.equal(FakeContext.instances.length, 4)
    await playback.dispose()
  })
})

it('stops a microphone acquired after sleep instead of connecting or sending queued PCM', async () => {
  let stopped = 0
  let sent = 0
  const stream = {
    getTracks: () => [{ stop: () => { stopped++ } }],
  }
  const microphone = deferred<typeof stream>()
  class FakeWorklet {
    static instance: FakeWorklet
    port = { onmessage: (_event: { data: Float32Array }) => {} }
    constructor() { FakeWorklet.instance = this }
    connect(): void {}
    disconnect(): void {}
  }
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: FakeContext })
  Object.defineProperty(globalThis, 'AudioWorkletNode', { configurable: true, value: FakeWorklet })
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { mediaDevices: { getUserMedia: () => microphone.promise } },
  })
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { api: {
      audioGetConfig: async () => ({ inputSampleRate: 16000, aecMode: 'app' }),
      audioSendPCM: () => { sent++ },
    } },
  })
  const capture = new AudioCapture()
  await capture.initialize()
  const starting = capture.start()
  await setImmediate()
  capture.stop()
  microphone.resolve(stream)
  await starting
  FakeWorklet.instance.port.onmessage({ data: new Float32Array(320) })
  assert.equal(stopped, 1)
  assert.equal(sent, 0)
  await capture.dispose()
})

it('interrupts device/config continuations on sleep and never revives after terminal cleanup', async () => {
  let command!: (value: string) => void
  let ready!: () => void
  let deviceVersion = 0
  let deviceChanged!: () => void
  let deviceListenerRemoved = false
  let microphoneUnavailable = false
  const states: Array<{ state: string, error?: string }> = []
  let pendingConfig: ReturnType<typeof deferred<object>> | undefined
  let configReads = 0
  let blockConfigAt = Number.POSITIVE_INFINITY
  const config = { inputDeviceName: 'mic', outputDeviceName: 'speaker', aecMode: 'app' }
  const track = { stop() {}, getSettings: () => ({}), onended: null }
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] }
  class Worklet {
    port = { onmessage: null }
    connect(): void {}
    disconnect(): void {}
  }
  class MusicAudio {
    addEventListener(): void {}
  }
  Object.defineProperty(globalThis, 'Audio', { configurable: true, value: MusicAudio })
  Object.defineProperty(globalThis, 'AudioWorkletNode', { configurable: true, value: Worklet })
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: FakeContext })
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { mediaDevices: {
      getUserMedia: async () => {
        if (microphoneUnavailable)
          throw new Error('microphone not ready')
        return stream
      },
      addEventListener: (_event: string, listener: () => void) => { deviceChanged = listener },
      removeEventListener: (_event: string, listener: () => void) => {
        deviceListenerRemoved = listener === deviceChanged
      },
      enumerateDevices: async () => [
        { kind: 'audioinput', label: 'mic', deviceId: `mic-${deviceVersion}` },
        { kind: 'audiooutput', label: 'speaker', deviceId: `speaker-${deviceVersion}` },
      ],
    } },
  })
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      addEventListener: (_event: string, listener: () => void) => { ready = listener },
      api: {
        musicOnCommand: () => {},
        onAudioCommand: (listener: (value: string) => void) => { command = listener },
        audioGetConfig: async () => {
          configReads++
          return configReads === blockConfigAt && pendingConfig ? pendingConfig.promise : config
        },
        audioOnOpusDecoded: () => () => {},
        audioReportAecCapture: async () => {},
        audioSendPCM: () => {},
        sendAudioState: (state: { state: string, error?: string }) => { states.push(state) },
      },
    },
  })
  FakeContext.instances = []
  FakeContext.sinks = []
  await import('../../../audio')
  ready()
  await setImmediate()
  assert.equal(FakeContext.instances.length, 2)
  const beforeSleep = FakeContext.instances.slice()
  deviceVersion++
  pendingConfig = deferred<object>()
  blockConfigAt = configReads + 2
  command('switchDevices')
  await setImmediate()
  assert.equal(configReads, blockConfigAt)
  command('suspend')
  pendingConfig.resolve(config)
  pendingConfig = undefined
  await setImmediate()
  assert.ok(beforeSleep.every(context => context.state === 'closed'))
  assert.equal(FakeContext.sinks.includes('speaker-1'), false)
  command('recover')
  await setImmediate()
  assert.equal(FakeContext.instances.length, 4)
  pendingConfig = deferred<object>()
  blockConfigAt = configReads + 1
  command('updateConfig')
  const reads = configReads
  command('suspend')
  pendingConfig.resolve(config)
  pendingConfig = undefined
  await setImmediate()
  assert.equal(configReads, reads)
  microphoneUnavailable = true
  command('recover')
  await setImmediate()
  assert.ok(FakeContext.instances.every(context => context.state === 'closed'))
  assert.equal(states.at(-1)?.error, 'microphone not ready')
  microphoneUnavailable = false
  deviceChanged()
  await setImmediate()
  assert.equal(states.at(-1)?.state, 'capturing')
  assert.equal(states.at(-1)?.error, undefined)
  assert.equal(FakeContext.instances.length, 8)
  assert.equal(FakeContext.instances[7].state, 'running')
  command('cleanup')
  assert.equal(deviceListenerRemoved, true)
  command('recover')
  deviceChanged()
  await setImmediate()
  assert.equal(FakeContext.instances.length, 8)
  assert.ok(FakeContext.instances.every(context => context.state === 'closed'))
})
