import type { AudioCommand } from './utils/audio/AudioCommandQueue'
import { AudioCapture } from './utils/audio/AudioCapture'
import { AudioCommandQueue } from './utils/audio/AudioCommandQueue'
import { AudioPlayback } from './utils/audio/AudioPlayback'
import { getDeviceIdsFromConfig } from './utils/audio/deviceUtils'
import { initMusicPlayer } from './utils/music/MusicPlayer'

// Music has its own HTMLAudio lifecycle and is independent from conversation PCM.
initMusicPlayer()

type AudioState = 'uninitialized' | 'initializing' | 'capturing' | 'suspended' | 'error'
let state: AudioState = 'uninitialized'
let generation = 0
let sleeping = false
let closed = false
let currentInputDeviceId: string | undefined
let currentOutputDeviceId: string | undefined
const playback = new AudioPlayback()
const capture = new AudioCapture(() => enqueue('recover'))
const commandQueue = new AudioCommandQueue(execute, (error) => {
  console.error('后台音频命令失败', error)
  updateState('error', error)
})

function updateState(next: AudioState, error?: unknown): void {
  state = next
  window.api.sendAudioState({
    state: next,
    capturing: next === 'capturing',
    initialized: next === 'capturing',
    error: error === undefined ? undefined : error instanceof Error ? error.message : String(error),
  })
}

async function disposeResources(): Promise<void> {
  const results = await Promise.allSettled([capture.dispose(), playback.dispose()])
  const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
  if (failures.length)
    throw new AggregateError(failures.map(result => result.reason), '音频资源释放失败')
}

/** A system wake rebuilds both contexts even if Chromium still reports running. */
async function rebuild(): Promise<void> {
  const version = generation
  const cancelled = () => version !== generation || sleeping || closed
  await disposeResources()
  if (cancelled())
    return
  updateState('initializing')
  try {
    const devices = await getDeviceIdsFromConfig()
    if (cancelled())
      return
    await capture.initialize(devices.inputDeviceId)
    if (cancelled()) {
      await disposeResources()
      return
    }
    await playback.initialize(devices.outputDeviceId)
    if (cancelled()) {
      await disposeResources()
      return
    }
    await capture.start()
    if (cancelled()) {
      await disposeResources()
      return
    }
    playback.start()
    currentInputDeviceId = devices.inputDeviceId
    currentOutputDeviceId = devices.outputDeviceId
    updateState('capturing')
  }
  catch (error) {
    await disposeResources()
    throw error
  }
}

async function switchDevices(): Promise<void> {
  const version = generation
  if (state !== 'capturing') {
    await rebuild()
    return
  }
  const devices = await getDeviceIdsFromConfig()
  if (version !== generation || sleeping || closed)
    return
  if (devices.inputDeviceId !== currentInputDeviceId) {
    await capture.switchDevice(devices.inputDeviceId || 'default')
    currentInputDeviceId = devices.inputDeviceId
  }
  if (version !== generation || sleeping || closed)
    return
  if (devices.outputDeviceId !== currentOutputDeviceId) {
    await playback.switchDevice(devices.outputDeviceId || 'default')
    currentOutputDeviceId = devices.outputDeviceId
  }
}

async function execute(command: AudioCommand): Promise<void> {
  if (command === 'cleanup' || command === 'suspend') {
    await disposeResources()
    updateState(command === 'cleanup' ? 'uninitialized' : 'suspended')
    return
  }
  if (sleeping || closed)
    return
  switch (command) {
    case 'initialize':
      if (state !== 'capturing')
        await rebuild()
      break
    case 'reinitialize':
    case 'recover':
      await rebuild()
      break
    case 'switchDevices':
      await switchDevices()
      break
    case 'updateConfig':
      if (state === 'capturing') {
        const version = generation
        await capture.updateConfig()
        if (version !== generation || sleeping || closed)
          return
        await playback.updateConfig()
      }
      break
  }
}

function enqueue(command: AudioCommand): void {
  if (closed)
    return
  if (command === 'suspend' || command === 'cleanup') {
    generation++
    sleeping = true
    closed = command === 'cleanup'
    if (closed)
      navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange)
    // Close data gates before awaiting in-flight resource work.
    capture.stop()
    playback.stop()
  }
  else if (command === 'recover') {
    sleeping = false
  }
  commandQueue.enqueue(command)
}

window.api.onAudioCommand((command) => {
  switch (command) {
    case 'switchDevices':
    case 'updateConfig':
    case 'reinitialize':
    case 'cleanup':
    case 'suspend':
    case 'recover':
      enqueue(command)
      break
    default:
      console.warn('未知音频命令:', command)
  }
})
function onDeviceChange(): void {
  enqueue('switchDevices')
}
navigator.mediaDevices.addEventListener('devicechange', onDeviceChange)
window.addEventListener('DOMContentLoaded', () => enqueue('initialize'))
