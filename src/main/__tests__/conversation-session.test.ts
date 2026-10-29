import type { ListeningMode } from '@shared/types'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ConversationSession } from '../bootstrap/ConversationSession'
import { EventBus, Events } from '../core/EventBus'
import { StateManager } from '../core/StateManager'
import { TaskManager } from '../core/TaskManager'

function createSession() {
  const bus = new EventBus()
  const state = new StateManager(bus)
  const tasks = new TaskManager()
  const calls: string[] = []
  let open = false
  let failStart = false
  let beforeStop = async () => {}
  const protocol = {
    isAudioChannelOpened: () => open,
    openAudioChannel: async () => {
      calls.push('open')
      open = true
      await bus.emit(Events.AUDIO_CHANNEL_OPENED)
      return true
    },
    closeAudioChannel: async () => {
      calls.push('close')
      open = false
      await bus.emit(Events.AUDIO_CHANNEL_CLOSED)
    },
    sendStartListening: async (mode: ListeningMode) => {
      calls.push(`start:${mode}`)
      if (failStart)
        throw new Error('start failed')
    },
    sendStopListening: async () => {
      calls.push('stop')
      await beforeStop()
    },
    sendAbort: async () => { calls.push('abort') },
    sendWakeWordDetected: async (text: string) => { calls.push(`text:${text}`) },
    reloadConfig: () => { calls.push('reload') },
  }
  const session = new ConversationSession(state, protocol, tasks, () => ({ conversationMode: 'auto' }))
  session.bindEvents(bus)
  return {
    session,
    state,
    bus,
    calls,
    failStart: (value: boolean) => { failStart = value },
    beforeStop: (work: () => Promise<void>) => { beforeStop = work },
  }
}

describe('conversation command ownership', () => {
  it('switches automatic to manual listening before resolving without renderer coordination', async () => {
    const { session, state, calls } = createSession()
    await session.startAutoConversation()
    calls.length = 0
    await session.startListeningManual()
    assert.deepEqual(calls, ['stop', 'close', 'open', 'start:manual'])
    assert.equal(state.getDeviceState(), 'listening')
    assert.equal(state.getListeningMode(), 'manual')
    assert.equal(state.isKeepListening(), false)
  })

  it('switches manual to automatic and stops that mode before submitting text', async () => {
    const { session, state, calls } = createSession()
    await session.startListeningManual()
    calls.length = 0
    await session.startAutoConversation()
    assert.deepEqual(calls, ['stop', 'start:auto'])
    assert.equal(state.isKeepListening(), true)
    calls.length = 0
    await session.sendText('hello')
    assert.deepEqual(calls, ['stop', 'close', 'open', 'text:hello'])
    assert.equal(state.isKeepListening(), false)
  })

  it('serializes overlapping commands from different callers until their mode transition completes', async () => {
    const fixture = createSession()
    const { session, state, calls } = fixture
    await session.startListeningManual()
    let release!: () => void
    let reachedStop!: () => void
    const stopped = new Promise<void>((resolve) => {
      reachedStop = resolve
    })
    fixture.beforeStop(() => {
      reachedStop()
      return new Promise<void>((resolve) => {
        release = resolve
      })
    })
    calls.length = 0
    const automatic = session.startAutoConversation()
    await stopped
    const manual = session.startListeningManual()
    assert.deepEqual(calls, ['stop'])
    release()
    fixture.beforeStop(async () => {})
    await Promise.all([automatic, manual])
    assert.deepEqual(calls, ['stop', 'start:auto', 'stop', 'close', 'open', 'start:manual'])
    assert.equal(state.getListeningMode(), 'manual')
    assert.equal(state.isKeepListening(), false)
  })

  it('resets failed starts and allows the next command to complete', async () => {
    const fixture = createSession()
    fixture.failStart(true)
    await assert.rejects(fixture.session.startAutoConversation(), /start failed/)
    assert.equal(fixture.state.getDeviceState(), 'idle')
    assert.equal(fixture.state.isKeepListening(), false)
    fixture.failStart(false)
    await fixture.session.startListeningManual()
    assert.equal(fixture.state.getDeviceState(), 'listening')
  })

  it('retains the target mode on session replacement and clears it on channel closure', async () => {
    const { session, state, bus } = createSession()
    await session.startListeningManual()
    await session.startListening('realtime')
    assert.equal(state.getListeningMode(), 'realtime')
    assert.equal(state.isKeepListening(), true)
    await bus.emit(Events.AUDIO_CHANNEL_CLOSED)
    assert.equal(state.getDeviceState(), 'idle')
    assert.equal(state.isKeepListening(), false)
  })

  it('keeps configuration reconnects idle and processes TTS without a frame queue', async () => {
    const { session, state, bus, calls } = createSession()
    await session.startAutoConversation()
    calls.length = 0
    await session.reconnectKeepingIdle()
    assert.deepEqual(calls, ['reload', 'close', 'open'])
    assert.equal(state.getDeviceState(), 'idle')
    assert.equal(state.isKeepListening(), false)
    await bus.emit(Events.INCOMING_JSON, { type: 'tts', state: 'start' })
    assert.equal(state.getDeviceState(), 'speaking')
    await bus.emit(Events.INCOMING_JSON, { type: 'tts', state: 'stop' })
    assert.equal(state.getDeviceState(), 'idle')
  })
})
