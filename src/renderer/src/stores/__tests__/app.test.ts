import type { RendererApi } from '@shared/rendererApi'
import type { AppStateSnapshot, ChatMessage, ChatSession } from '@shared/types'
import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '../app'

const idle: AppStateSnapshot = {
  deviceState: 'idle',
  listeningMode: 'manual',
  keepListening: false,
  channelOpen: false,
}
const listening: AppStateSnapshot = {
  deviceState: 'listening',
  listeningMode: 'auto',
  keepListening: true,
  channelOpen: true,
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function message(sessionId: string): ChatMessage {
  return { id: 1, session_id: sessionId, role: 'user', content: sessionId, sourceType: 'text', timestamp: 1 }
}

function session(sessionId: string): ChatSession {
  return { id: 1, session_id: sessionId, title: sessionId, message_count: 1, started_at: 1, last_message_at: 1 }
}

function installApi(overrides: Partial<RendererApi> = {}): void {
  const api = {
    appGetState: async () => idle,
    chatGetSessions: async () => [],
    chatGetMessages: async () => [],
    ...overrides,
  } satisfies Partial<RendererApi>
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { api } })
}

beforeEach(() => {
  setActivePinia(createPinia())
  installApi()
})

describe('chat selection and live following', () => {
  it('keeps the latest selection when earlier messages arrive last', async () => {
    const first = deferred<ChatMessage[]>()
    const second = deferred<ChatMessage[]>()
    installApi({ chatGetMessages: id => id === 'a' ? first.promise : second.promise })
    const store = useAppStore()
    const a = store.switchSession('a')
    const b = store.switchSession('b')
    second.resolve([message('b')])
    await b
    first.resolve([message('a')])
    await a
    assert.equal(store.selectedSessionId, 'b')
    assert.equal(store.messages[0]?.content, 'b')
  })

  it('follows live initially and preserves manual history browsing', async () => {
    installApi({
      chatGetSessions: async () => [session('history'), session('live')],
      chatGetMessages: async id => [message(id)],
    })
    const store = useAppStore()
    await store.ensureSelectedSession()
    assert.equal(store.selectedSessionId, 'history')
    assert.equal(store.followLive, true)
    await store.handleMessagesAdded({ sessionId: 'live' })
    assert.equal(store.selectedSessionId, 'live')
    await store.switchSession('history')
    await store.handleMessagesAdded({ sessionId: 'next-live' })
    assert.equal(store.liveSessionId, 'next-live')
    assert.equal(store.selectedSessionId, 'history')
    assert.equal(store.messages[0]?.content, 'history')
    assert.equal(store.sessions.find(item => item.sessionId === 'history')?.active, true)
    await store.switchSession('next-live')
    await store.handleMessagesAdded({ sessionId: 'new-live' })
    assert.equal(store.selectedSessionId, 'new-live')
  })

  it('does not commit messages after the bridge invalidates pending loads', async () => {
    const request = deferred<ChatMessage[]>()
    installApi({ chatGetMessages: () => request.promise })
    const store = useAppStore()
    const loading = store.switchSession('history')
    store.invalidatePendingRequests()
    request.resolve([message('history')])
    await loading
    assert.deepEqual(store.messages, [])
  })

  it('does not restart queries when a delete finishes after invalidation', async () => {
    const deletion = deferred<void>()
    let queries = 0
    installApi({
      chatDeleteSession: () => deletion.promise,
      chatGetSessions: async () => {
        queries++
        return []
      },
    })
    const store = useAppStore()
    await store.switchSession('history')
    const deleting = store.deleteSession('history')
    store.invalidatePendingRequests()
    deletion.resolve()
    await deleting
    assert.equal(store.selectedSessionId, 'history')
    assert.equal(queries, 0)
  })
})

describe('conversation intentions and snapshots', () => {
  it('does not treat a text response with a retained auto mode as an automatic conversation', () => {
    const store = useAppStore()
    store.updateState({ ...listening, deviceState: 'speaking', keepListening: false })
    assert.equal(store.isAutoConversationActive, false)
  })

  it('ignores duplicate controls while pending and applies the completed command state', async () => {
    const command = deferred<void>()
    let starts = 0
    installApi({
      appStartAutoConversation: () => {
        starts++
        return command.promise
      },
      appGetState: async () => listening,
    })
    const store = useAppStore()
    const first = store.toggleAutoConversation()
    await store.toggleAutoConversation()
    assert.equal(starts, 1)
    assert.equal(store.pendingIntent, 'start-auto')
    command.resolve()
    await first
    assert.equal(store.isAutoConversationActive, true)
    assert.equal(store.isConversationPending, false)
  })

  it('preserves a successful send when only the follow-up state refresh fails', async () => {
    let sends = 0
    installApi({
      appSendText: async () => { sends++ },
      appGetState: async () => { throw new Error('snapshot unavailable') },
    })
    const store = useAppStore()
    await assert.doesNotReject(store.submitText('hello'))
    assert.equal(sends, 1)
    assert.equal(store.isConversationPending, false)
  })

  it('clears pending after a failed command', async () => {
    installApi({
      appStartListeningManual: async () => {
        throw new Error('offline')
      },
    })
    const store = useAppStore()
    await assert.rejects(store.toggleManualListening(), /offline/)
    assert.equal(store.isConversationPending, false)
    assert.equal(store.isManualListening, false)
  })

  for (const initialReturnsFirst of [true, false]) {
    it(`prefers a newer snapshot when initial returns ${initialReturnsFirst ? 'first' : 'last'}`, async () => {
      const initial = deferred<AppStateSnapshot>()
      const command = deferred<AppStateSnapshot>()
      let requests = 0
      installApi({ appGetState: () => ++requests === 1 ? initial.promise : command.promise })
      const store = useAppStore()
      const before = store.refreshState()
      const after = store.refreshState()
      if (initialReturnsFirst) {
        initial.resolve(idle)
        await before
        command.resolve(listening)
        await after
      }
      else {
        command.resolve(listening)
        await after
        initial.resolve(idle)
        await before
      }
      assert.equal(store.deviceState, 'listening')
    })
  }

  it('does not let a snapshot overwrite an event or commit after disposal', async () => {
    const request = deferred<AppStateSnapshot>()
    installApi({ appGetState: () => request.promise })
    const store = useAppStore()
    const loading = store.refreshState()
    store.updateState(listening)
    request.resolve(idle)
    await loading
    assert.equal(store.deviceState, 'listening')
    await store.refreshState(() => false)
    assert.equal(store.deviceState, 'listening')
  })
})
