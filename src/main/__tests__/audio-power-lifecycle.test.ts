import type { BrowserWindow } from 'electron'
import type { PluginCommands, PluginContext } from '../core/interfaces'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { describe, it } from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { powerMonitor } from 'electron'
import { EventBus } from '../core/EventBus'
import { AudioPlugin } from '../plugins/AudioPlugin'

function createFixture() {
  const listeners = new Map<string, (event: unknown, data: Int16Array) => void>()
  const runtime = { handlers: new Map(), listeners }
  ;(globalThis as typeof globalThis & { __ipcRuntime: typeof runtime }).__ipcRuntime = runtime
  const messages: Array<{ channel: string, args: unknown[] }> = []
  const uploaded: Buffer[] = []
  let destroyed = false
  const window = {
    isDestroyed: () => destroyed,
    webContents: {
      send: (channel: string, ...args: unknown[]) => messages.push({ channel, args }),
    },
  } as unknown as BrowserWindow
  const eventBus = new EventBus()
  const ctx: PluginContext = {
    eventBus,
    getDeviceState: () => 'listening',
    getListeningMode: () => 'auto',
    isListening: () => true,
    isSpeaking: () => false,
    isKeepListening: () => true,
    isIdle: () => false,
    isAudioChannelOpened: () => true,
    shouldCaptureAudio: () => true,
  }
  const cmd: PluginCommands = {
    startListening: async () => {},
    stopListening: async () => {},
    abortSpeaking: async () => {},
    sendAudio: async (data) => { uploaded.push(data) },
    sendText: async () => {},
    connectProtocol: async () => true,
    sendMcpMessage: async () => {},
    sendWakeWordDetected: async () => {},
    track: promise => promise,
  }
  const plugin = new AudioPlugin()
  plugin.setBackgroundAudioWindow(window)
  return {
    plugin,
    ctx,
    cmd,
    messages,
    listeners,
    uploaded,
    destroyWindow: () => {
      destroyed = true
    },
  }
}

describe('audio power lifecycle', () => {
  it('drops capture and playback frames during sleep and requests recovery on wake', async () => {
    const fixture = createFixture()
    const { plugin, ctx, cmd, messages, uploaded, listeners } = fixture
    await plugin.setup(ctx, cmd)
    try {
      plugin.onIncomingAudio(Buffer.from([1]))
      assert.equal(messages.filter(item => item.channel === 'audio:opus-decoded').length, 1)

      powerMonitor.emit('suspend')
      assert.deepEqual(messages.at(-1), { channel: 'audio:command', args: ['suspend'] })
      messages.length = 0
      plugin.onIncomingAudio(Buffer.from([2]))
      listeners.get('audio:pcm')!({}, new Int16Array([10]))
      assert.equal(messages.length, 0)
      assert.equal(uploaded.length, 0)

      powerMonitor.emit('resume')
      assert.deepEqual(messages.at(-1), { channel: 'audio:command', args: ['recover'] })
      plugin.onIncomingAudio(Buffer.from([3]))
      listeners.get('audio:pcm')!({}, new Int16Array([20]))
      assert.equal(messages.filter(item => item.channel === 'audio:opus-decoded').length, 1)
      assert.equal(uploaded.length, 1)
    }
    finally {
      await plugin.shutdown()
      await setImmediate()
    }
  })

  it('removes its power listeners on shutdown without disturbing other owners', async () => {
    const { plugin, ctx, cmd, messages } = createFixture()
    let otherResumes = 0
    const otherListener = () => {
      otherResumes++
    }
    const suspendListeners = powerMonitor.listenerCount('suspend')
    const resumeListeners = powerMonitor.listenerCount('resume')
    powerMonitor.on('resume', otherListener)
    await plugin.setup(ctx, cmd)
    assert.equal(powerMonitor.listenerCount('suspend'), suspendListeners + 1)
    assert.equal(powerMonitor.listenerCount('resume'), resumeListeners + 2)
    await plugin.shutdown()
    assert.deepEqual(messages.at(-1), { channel: 'audio:command', args: ['cleanup'] })
    messages.length = 0
    try {
      powerMonitor.emit('resume')
      assert.equal(otherResumes, 1)
      assert.equal(messages.length, 0)
      assert.equal(powerMonitor.listenerCount('suspend'), suspendListeners)
      assert.equal(powerMonitor.listenerCount('resume'), resumeListeners + 1)
    }
    finally {
      powerMonitor.removeListener('resume', otherListener)
    }
  })

  it('does not dispatch recovery to a destroyed audio window', async () => {
    const { plugin, ctx, cmd, messages, destroyWindow } = createFixture()
    await plugin.setup(ctx, cmd)
    try {
      destroyWindow()
      powerMonitor.emit('suspend')
      powerMonitor.emit('resume')
      assert.equal(messages.length, 0)
    }
    finally {
      await plugin.shutdown()
    }
  })
})
