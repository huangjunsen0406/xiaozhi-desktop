/**
 * 精灵图版本推断：manifest 优先，高度兜底，缺尺寸不阻断列表。
 * 运行：npx tsx --test src/main/__tests__/pet-sprite-version.test.ts
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  inferSpriteVersionFromHeight,
  normalizeSpriteVersion,
  PET_SPRITE_V1_ATLAS_HEIGHT,
  PET_SPRITE_V2_ATLAS_HEIGHT,
  resolveSpriteVersion,
} from '../../shared/types/pets'

describe('normalizeSpriteVersion', () => {
  it('accepts 1 / 2 and string forms', () => {
    assert.equal(normalizeSpriteVersion(1), 1)
    assert.equal(normalizeSpriteVersion(2), 2)
    assert.equal(normalizeSpriteVersion('1'), 1)
    assert.equal(normalizeSpriteVersion('2'), 2)
  })

  it('rejects other values', () => {
    assert.equal(normalizeSpriteVersion(undefined), undefined)
    assert.equal(normalizeSpriteVersion(3), undefined)
    assert.equal(normalizeSpriteVersion('v2'), undefined)
  })
})

describe('inferSpriteVersionFromHeight', () => {
  it('maps Codex atlas heights', () => {
    assert.equal(inferSpriteVersionFromHeight(PET_SPRITE_V1_ATLAS_HEIGHT), 1)
    assert.equal(inferSpriteVersionFromHeight(PET_SPRITE_V2_ATLAS_HEIGHT), 2)
  })
})

describe('resolveSpriteVersion', () => {
  it('prefers explicit manifest over height', () => {
    assert.equal(resolveSpriteVersion(1, PET_SPRITE_V2_ATLAS_HEIGHT), 1)
    assert.equal(resolveSpriteVersion(2, PET_SPRITE_V1_ATLAS_HEIGHT), 2)
  })

  it('falls back to 1 when sharp cannot report height', () => {
    assert.equal(resolveSpriteVersion(undefined, undefined), 1)
    assert.equal(resolveSpriteVersion(undefined, 0), 1)
  })

  it('uses height when manifest is missing', () => {
    assert.equal(resolveSpriteVersion(undefined, PET_SPRITE_V2_ATLAS_HEIGHT), 2)
  })
})
