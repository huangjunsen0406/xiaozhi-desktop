import assert from 'node:assert/strict'
import { it } from 'node:test'
import { runMcpPluginOperation } from '../mcp/plugins/operations'

it('serializes plugin mutations and continues after failed operations', async () => {
  const events: string[] = []
  let release!: () => void
  const barrier = new Promise<void>((resolve) => {
    release = resolve
  })
  const first = runMcpPluginOperation(async () => {
    events.push('install')
    await barrier
    events.push('rollback')
    throw new Error('failed')
  })
  const rejected = assert.rejects(first, /failed/)
  const second = runMcpPluginOperation(() => {
    events.push('refresh')
  })
  await Promise.resolve()
  assert.deepEqual(events, ['install'])
  release()
  await rejected
  await second
  assert.deepEqual(events, ['install', 'rollback', 'refresh'])
})
