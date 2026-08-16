/**
 * 内置宠物种子：Codex 占坑后消失应补拷，用户删除不复活。
 * 运行：npx tsx --test src/main/__tests__/pets-seed.test.ts
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { shouldCopyBuiltinPet } from '../../shared/petsSeed'

describe('shouldCopyBuiltinPet', () => {
  it('copies when neither local nor Codex has it', () => {
    assert.equal(shouldCopyBuiltinPet({
      localExists: false,
      codexExists: false,
      userRemoved: false,
    }), true)
  })

  it('skips when Codex still has the id (user screenshot: only sensen local)', () => {
    assert.equal(shouldCopyBuiltinPet({
      localExists: false,
      codexExists: true,
      userRemoved: false,
    }), false)
  })

  it('copies after Codex is deleted and local never had it', () => {
    assert.equal(shouldCopyBuiltinPet({
      localExists: false,
      codexExists: false,
      userRemoved: false,
    }), true)
  })

  it('does not resurrect a user-deleted builtin', () => {
    assert.equal(shouldCopyBuiltinPet({
      localExists: false,
      codexExists: false,
      userRemoved: true,
    }), false)
  })

  it('does not overwrite an existing local copy', () => {
    assert.equal(shouldCopyBuiltinPet({
      localExists: true,
      codexExists: false,
      userRemoved: false,
    }), false)
  })
})
