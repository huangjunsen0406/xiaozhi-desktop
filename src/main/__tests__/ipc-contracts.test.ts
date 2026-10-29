import type { IpcResult, WakeWordConfig } from '@shared/types'
import type { DbChatMessage, DbWakeWordConfigPatch } from '../types/database'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { beforeEach, describe, it } from 'node:test'
import { backgroundAudioApi } from '../../preload/modules/backgroundAudio'
import { chatApi } from '../../preload/modules/chat'
import { wakeWordApi } from '../../preload/modules/wakeWord'
import { registerBackgroundAudioIpc } from '../ipc/backgroundAudioIpc'
import { registerCameraConfigIpc } from '../ipc/cameraConfigIpc'
import { registerChatIpc } from '../ipc/chatIpc'
import { createIpcHandler, success } from '../ipc/middleware'
import { registerMusicConfigIpc } from '../ipc/musicConfigIpc'
import { registerWakeWordIpc } from '../ipc/wakeWordIpc'

type Handler = (event: unknown, ...args: unknown[]) => unknown

const messages: DbChatMessage[] = []
const config: WakeWordConfig = { enabled: false, language: 'zh', keyword: '你好小智', cooldownMs: 1500 }
const writes: unknown[] = []
const runtime = {
  handlers: new Map<string, Handler>(),
  listeners: new Map<string, Handler>(),
  database: {
    addChatMessage(data: Omit<DbChatMessage, 'id' | 'created_at'>): DbChatMessage {
      const message = { ...data, id: messages.length + 1, created_at: 1 }
      messages.push(message)
      return message
    },
    getChatMessages: () => messages,
    getFormattedWakeWordConfig: () => ({ ...config }),
    getOrCreateWakeWordConfig: () => ({ keyword_zh: '你好小智', keyword_en: '' }),
    updateWakeWordConfig(patch: DbWakeWordConfigPatch) {
      writes.push(patch)
      if (patch.cooldown_ms !== undefined)
        config.cooldownMs = patch.cooldown_ms
    },
    updateCameraConfig: (patch: unknown) => writes.push(patch),
    updateMusicConfig: (patch: unknown) => writes.push(patch),
  },
}

// The test runner substitutes only desktop/storage boundaries; real handlers and preload APIs run above them.
;(globalThis as typeof globalThis & { __ipcRuntime: typeof runtime }).__ipcRuntime = runtime

async function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<IpcResult<T>> {
  const handler = runtime.handlers.get(channel)
  assert.ok(handler, `missing IPC handler: ${channel}`)
  return await handler({}, ...args) as IpcResult<T>
}

describe('IPC contracts', () => {
  beforeEach(() => {
    runtime.handlers.clear()
    runtime.listeners.clear()
    messages.length = 0
    writes.length = 0
    config.cooldownMs = 1500
  })

  it('returns the same typed message and image shape from add and list', async () => {
    registerChatIpc()
    const added = await chatApi.addMessage({
      session_id: 'session-1',
      role: 'user',
      content: 'image',
      sourceType: 'image',
      image_data: new Uint8Array([1, 2, 3]),
      timestamp: 123,
    })
    const listed = await chatApi.getMessages('session-1')
    assert.deepEqual(listed, [added])
    assert.equal(added.sourceType, 'image')
    assert.equal('source_type' in added, false)
    assert.ok(added.image_data instanceof Uint8Array)
    assert.equal(Buffer.isBuffer(added.image_data), false)
    assert.deepEqual(Array.from(added.image_data), [1, 2, 3])
    assert.ok(Buffer.isBuffer(messages[0].image_data))
  })

  it('round-trips cooldownMs through the public wake word API', async () => {
    registerWakeWordIpc({ container: { getWakeWordPlugin: () => undefined } } as unknown as Parameters<typeof registerWakeWordIpc>[0])
    await wakeWordApi.updateConfig({ cooldownMs: 2400 })
    assert.equal((await wakeWordApi.getConfig()).cooldownMs, 2400)
    assert.equal((writes[0] as DbWakeWordConfigPatch).cooldown_ms, 2400)
    await assert.rejects(wakeWordApi.updateConfig({ cooldownMs: Number.NaN }), /有限数字/)
    assert.equal(writes.length, 1)
  })

  it('keeps initialized and device state across partial audio reports', async () => {
    registerBackgroundAudioIpc()
    backgroundAudioApi.sendAudioState({ initialized: true, capturing: true, currentInputDeviceId: 'mic-1' })
    backgroundAudioApi.sendAudioState({ capturing: false })
    const status = await backgroundAudioApi.getStatus()
    assert.equal(status.initialized, true)
    assert.equal(status.capturing, false)
    assert.equal(status.currentInputDeviceId, 'mic-1')
    runtime.listeners.get('audio:state')?.({}, { initialized: 'yes' })
    assert.deepEqual(await backgroundAudioApi.getStatus(), status)
  })

  it('rejects arrays as objects and nonfinite numbers before handler execution', async () => {
    let called = false
    createIpcHandler({
      channel: 'test:validate',
      schema: { options: { type: 'object', required: true }, volume: { type: 'number', min: 0, max: 100 } },
      handler: () => {
        called = true
        return success()
      },
    })
    for (const args of [[[], 10], [{}, Number.NaN], [{}, Number.POSITIVE_INFINITY]]) {
      assert.equal((await invoke('test:validate', ...args)).success, false)
    }
    assert.equal(called, false)
    assert.equal((await invoke('test:validate', {}, 50)).success, true)
  })

  it('validates configuration fields before writes and maps only writable keys', async () => {
    registerCameraConfigIpc()
    registerMusicConfigIpc()
    assert.equal((await invoke('camera-config:update', { captureWidth: -1 })).success, false)
    assert.equal((await invoke('camera-config:update', { jpegQuality: Number.NaN })).success, false)
    assert.equal((await invoke('music:update-config', { searchUrl: false })).success, false)
    assert.equal(writes.length, 0)
    assert.equal((await invoke('camera-config:update', { captureWidth: 640, id: 99 })).success, true)
    assert.equal((writes[0] as Record<string, unknown>).capture_width, 640)
    assert.equal('id' in (writes[0] as object), false)
    assert.equal((await invoke('music:update-config', { searchUrl: 'https://example.test', id: 99 })).success, true)
    assert.equal((writes[1] as Record<string, unknown>).search_url, 'https://example.test')
    assert.equal('id' in (writes[1] as object), false)
  })
})
