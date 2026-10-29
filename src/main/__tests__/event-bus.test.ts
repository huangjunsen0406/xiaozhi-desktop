import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { EventBus, Events } from '../core/EventBus'

describe('typed event bus', () => {
  it('awaits every subscriber while isolating one subscriber failure', async () => {
    const bus = new EventBus()
    const received: string[] = []
    bus.on(Events.NETWORK_ERROR, async () => {
      throw new Error('subscriber failed')
    })
    bus.on(Events.NETWORK_ERROR, async (error) => {
      await Promise.resolve()
      received.push(error)
    })
    await bus.emit(Events.NETWORK_ERROR, 'disconnected')
    assert.deepEqual(received, ['disconnected'])
  })

  it('removes once handlers before reentrant publication', async () => {
    const bus = new EventBus()
    let count = 0
    bus.once(Events.AUDIO_CHANNEL_OPENED, async () => {
      count++
      await bus.emit(Events.AUDIO_CHANNEL_OPENED)
    })
    await bus.emit(Events.AUDIO_CHANNEL_OPENED)
    assert.equal(count, 1)
    assert.equal(bus.handlerCount(Events.AUDIO_CHANNEL_OPENED), 0)
  })

  it('returns an exact unsubscribe and rejects sequential broadcasts on failure', async () => {
    const bus = new EventBus()
    const unsubscribe = bus.on(Events.NETWORK_ERROR, () => {
      throw new Error('stop')
    })
    let followingCalled = false
    bus.on(Events.NETWORK_ERROR, () => {
      followingCalled = true
    })
    await assert.rejects(bus.emitSequential(Events.NETWORK_ERROR, 'x'), /stop/)
    assert.equal(followingCalled, false)
    unsubscribe()
    await bus.emitSequential(Events.NETWORK_ERROR, 'x')
    assert.equal(followingCalled, true)
  })
})
