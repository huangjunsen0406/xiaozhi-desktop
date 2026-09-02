/**
 * 唤醒词脚本 / token 校验纯函数单测
 * 运行：npx tsx --test src/main/__tests__/keyword-validation.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { hasResetDataFlag, stripResetDataArgs } from '../services/resetDataFlag'
import {
  extractKeywordTokens,
  parseTokensFile,
  validateKeywordLineTokens,
  validateKeywordScript,
} from '../wake-word/keywordValidation'

/** 本机实测：PinyinConverter.toKeywordFormat('你好moss') */
const NIAO_MOSS_LINE = 'n ǐ h ǎo m oss @你好moss'

describe('validateKeywordScript', () => {
  it('accepts Chinese-only on zh model', () => {
    assert.equal(validateKeywordScript('zh', '你好小智'), null)
    assert.equal(validateKeywordScript('zh', '哈喽小智'), null)
  })

  it('rejects mixed 中英 on zh model (你好moss)', () => {
    const error = validateKeywordScript('zh', '你好moss')
    assert.ok(error)
    assert.match(error, /中英混写|汉字/)
  })

  it('rejects English-only on zh model with a language hint', () => {
    const error = validateKeywordScript('zh', 'Hello Moss')
    assert.ok(error)
    assert.match(error, /英文模型/)
  })

  it('accepts English-only on en model', () => {
    assert.equal(validateKeywordScript('en', 'MOSS'), null)
    assert.equal(validateKeywordScript('en', 'Hello Moss'), null)
  })

  it('rejects Chinese on en model with a language hint', () => {
    const error = validateKeywordScript('en', '你好小智')
    assert.ok(error)
    assert.match(error, /中文模型/)
  })

  it('rejects empty / punctuation', () => {
    assert.ok(validateKeywordScript('zh', '   '))
    assert.ok(validateKeywordScript('zh', '你好!'))
    assert.ok(validateKeywordScript('en', 'hey-siri'))
  })
})

describe('validateKeywordLineTokens', () => {
  it('flags unknown syllable oss from 你好moss pinyin split', () => {
    const tokens = parseTokensFile('n 1\nǐ 2\nh 3\nǎo 4\nm 5\n')
    const error = validateKeywordLineTokens('n ǐ h ǎo m oss @你好moss', tokens)
    assert.ok(error)
    assert.match(error, /oss/)
  })

  it('accepts default 你好小智 line when tokens exist', () => {
    const tokens = parseTokensFile('n 1\nǐ 2\nh 3\nǎo 4\nx 5\niǎo 6\nzh 7\nì 8\n')
    assert.equal(
      validateKeywordLineTokens('n ǐ h ǎo x iǎo zh ì @你好小智', tokens),
      null,
    )
  })

  it('extractKeywordTokens ignores the @phrase suffix', () => {
    assert.deepEqual(
      extractKeywordTokens('n ǐ h ǎo m oss @你好moss'),
      ['n', 'ǐ', 'h', 'ǎo', 'm', 'oss'],
    )
  })
})

describe('你好moss vs real zh tokens', () => {
  it('splits into unknown syllable oss', () => {
    assert.ok(extractKeywordTokens(NIAO_MOSS_LINE).includes('oss'))
  })

  it('real zh tokens.txt rejects the encoded line', () => {
    const tokensPath = path.join(process.cwd(), 'resources/wake-word-models/zh/tokens.txt')
    const tokenSet = parseTokensFile(readFileSync(tokensPath, 'utf-8'))
    const error = validateKeywordLineTokens(NIAO_MOSS_LINE, tokenSet)
    assert.ok(error)
    assert.match(error!, /oss/)
  })
})

describe('reset-data flag', () => {
  it('detects chromium-normalized and raw flags', () => {
    assert.equal(hasResetDataFlag(['/app', '--reset-data']), true)
    assert.equal(hasResetDataFlag(['/app', 'reset-data']), true)
    assert.equal(hasResetDataFlag(['/app', '--reset-data=1']), true)
    assert.equal(hasResetDataFlag(['/app', '--other']), false)
  })

  it('strips the flag so relaunch does not loop', () => {
    assert.deepEqual(
      stripResetDataArgs(['--hidden', '--reset-data', 'foo']),
      ['--hidden', 'foo'],
    )
  })
})
