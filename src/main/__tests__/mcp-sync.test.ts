import assert from 'node:assert/strict'
import { it } from 'node:test'
import { syncMcpTools } from '../services/mcpToolsSync'

it('distinguishes offline deferred sync, successful reconnect, and failed reconnect', async () => {
  const runtime = globalThis as typeof globalThis & { __mcpRuntime?: unknown }
  let connected = false
  let reconnected = false
  let failure: Error | undefined
  runtime.__mcpRuntime = {
    container: {
      isAudioChannelOpened: () => connected,
      reconnectProtocol: async () => {
        if (failure)
          throw failure
        connected = reconnected
      },
    },
  }
  try {
    assert.deepEqual(await syncMcpTools(), { status: 'deferred' })
    connected = true
    reconnected = true
    assert.deepEqual(await syncMcpTools(), { status: 'reconnected' })
    reconnected = false
    assert.equal((await syncMcpTools()).status, 'failed')
    failure = new Error('network unavailable')
    assert.deepEqual(await syncMcpTools(), { status: 'failed', error: 'network unavailable' })
  }
  finally {
    delete runtime.__mcpRuntime
  }
})
