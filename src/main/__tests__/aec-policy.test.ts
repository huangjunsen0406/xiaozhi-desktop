/**
 * AecPolicy 纯函数单测
 * 运行：npx tsx --test src/main/__tests__/aec-policy.test.ts
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

describe('AecPolicy', () => {
  it('featuresForAecMode', async () => {
    const { featuresForAecMode } = await import('../audio/AecPolicy')
    assert.equal(
      featuresForAecMode('app'),
      'ChromeWideEchoCancellation',
    )
    assert.equal(
      featuresForAecMode('off'),
      'ChromeWideEchoCancellation',
    )
    assert.equal(
      featuresForAecMode('system'),
      'ChromeWideEchoCancellation,SystemLoopbackAsAecReference',
    )
  })

  it('requiresRelaunchForAecMode only when crossing system', async () => {
    const { requiresRelaunchForAecMode } = await import('../audio/AecPolicy')
    assert.equal(requiresRelaunchForAecMode('app', 'off'), false)
    assert.equal(requiresRelaunchForAecMode('off', 'app'), false)
    assert.equal(requiresRelaunchForAecMode('app', 'system'), true)
    assert.equal(requiresRelaunchForAecMode('system', 'app'), true)
    assert.equal(requiresRelaunchForAecMode('system', 'system'), false)
  })

  it('legacy mapping', async () => {
    const {
      aecModeFromLegacyEchoFlag,
      legacyEchoFlagFromAecMode,
      normalizeAecMode,
    } = await import('../audio/AecPolicy')

    assert.equal(aecModeFromLegacyEchoFlag(true), 'app')
    assert.equal(aecModeFromLegacyEchoFlag(false), 'off')
    assert.equal(aecModeFromLegacyEchoFlag(undefined), 'app')

    assert.equal(legacyEchoFlagFromAecMode('app'), true)
    assert.equal(legacyEchoFlagFromAecMode('system'), true)
    assert.equal(legacyEchoFlagFromAecMode('off'), false)

    assert.equal(normalizeAecMode('system'), 'system')
    assert.equal(normalizeAecMode('nope'), 'app')
  })
})
