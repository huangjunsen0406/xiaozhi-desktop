/**
 * 最小单测：显式初始化访问器（禁止懒 getInstance）
 *
 * 运行：npx tsx --test src/main/__tests__/de-singleton-accessors.test.ts
 *
 * 仅覆盖不依赖 Electron runtime / path alias 的 get* 语义。
 * ActivationService / ServiceContainer 的 throw-before-create 由 typecheck + 启动顺序保证
 * （其 import 图依赖 electron / @shared，不宜在裸 tsx 下测）。
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

describe('de-singleton accessors (throw before init)', () => {
  it('getDatabase throws when not initialized', async () => {
    const { resetDatabase, getDatabase } = await import('../services/database')
    resetDatabase()
    assert.throws(
      () => getDatabase(),
      /Database not initialized/,
    )
  })

  it('getConfigManager throws when not initialized', async () => {
    const { resetConfigManager, getConfigManager } = await import('../services/configManagerDB')
    resetConfigManager()
    assert.throws(
      () => getConfigManager(),
      /ConfigManager not initialized/,
    )
  })

  it('getDeviceFingerprint throws when not initialized', async () => {
    const { resetDeviceFingerprint, getDeviceFingerprint } = await import('../services/deviceFingerprintDB')
    resetDeviceFingerprint()
    assert.throws(
      () => getDeviceFingerprint(),
      /DeviceFingerprint not initialized/,
    )
  })
})
