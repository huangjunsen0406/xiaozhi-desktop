/**
 * 最小单测：WS clean close 判定
 *
 * 直接导入纯模块（无 Electron / ws 依赖）。
 * 运行：npx tsx --test src/main/__tests__/protocol-clean-close.test.ts
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isCleanCloseCode } from '../protocols/wsCloseCodes'

describe('WS clean close codes', () => {
  it('treats 1000/1001/1005 as clean', () => {
    assert.equal(isCleanCloseCode(1000), true)
    assert.equal(isCleanCloseCode(1001), true)
    assert.equal(isCleanCloseCode(1005), true)
  })

  it('treats abnormal codes as non-clean', () => {
    assert.equal(isCleanCloseCode(1006), false)
    assert.equal(isCleanCloseCode(1011), false)
    assert.equal(isCleanCloseCode(4000), false)
  })
})
