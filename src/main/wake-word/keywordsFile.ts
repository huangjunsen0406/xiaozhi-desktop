/**
 * 唤醒词 keywords.txt 生成与落盘
 *
 * 模型 onnx/tokens 读打包目录；keywords.txt 只写 userData，避免安装包 Resources 只读导致
 * 自定义唤醒词保存成功但运行时仍用默认词。
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { BpeConverter } from '../utils/BpeConverter'
import { getLogger } from '../utils/logger'
import {
  getWakeWordKeywordsPath,
  getWakeWordModelsBundledDir,
} from '../utils/paths'
import { PinyinConverter } from '../utils/PinyinConverter'
import {
  parseTokensFile,
  validateKeywordLineTokens,
  validateKeywordScript,
} from './keywordValidation'

const logger = getLogger('WakeWordKeywords')

const tokenSetCache = new Map<string, Set<string>>()

export const DEFAULT_WAKE_WORD_ZH = '你好小智'
export const DEFAULT_WAKE_WORD_EN = 'MOSS'

/**
 * 按语言解析有效唤醒词（空则回落到默认）
 */
export function resolveWakeWordKeyword(
  language: string,
  keyword: string | null | undefined,
): string {
  const trimmed = keyword?.trim() ?? ''
  if (trimmed)
    return trimmed
  if (language === 'en')
    return DEFAULT_WAKE_WORD_EN
  return DEFAULT_WAKE_WORD_ZH
}

/**
 * 将自然语言唤醒词转为 sherpa keywords 行
 *
 * @param language zh | en
 * @param keyword 已 trim 的关键词
 * @returns 单行 keyword 内容（不含尾换行）
 */
export function buildWakeWordKeywordLine(language: string, keyword: string): string {
  const bundledLangDir = path.join(getWakeWordModelsBundledDir(), language)

  if (language === 'zh') {
    return PinyinConverter.toKeywordFormat(keyword)
  }

  if (language === 'en') {
    const tokensPath = path.join(bundledLangDir, 'tokens.txt')
    if (!existsSync(tokensPath)) {
      throw new Error(`英文 tokens 不存在: ${tokensPath}`)
    }
    return BpeConverter.toKeywordFormat(keyword, tokensPath)
  }

  throw new Error(`不支持的语言: ${language}`)
}

function getTokenSet(language: string): Set<string> {
  const cached = tokenSetCache.get(language)
  if (cached)
    return cached

  const tokensPath = path.join(getWakeWordModelsBundledDir(), language, 'tokens.txt')
  if (!existsSync(tokensPath)) {
    throw new Error(`tokens 不存在: ${tokensPath}`)
  }
  const tokenSet = parseTokensFile(readFileSync(tokensPath, 'utf-8'))
  tokenSetCache.set(language, tokenSet)
  return tokenSet
}

export interface EncodedWakeWord {
  keyword: string
  keywordLine: string
}

/**
 * 校验脚本 + 编码 + 校验模型词表。失败抛错，禁止写入非法 keywords.txt。
 */
export function encodeAndValidateWakeWord(
  language: string,
  keyword: string | null | undefined,
): EncodedWakeWord {
  const effective = resolveWakeWordKeyword(language, keyword)
  const scriptError = validateKeywordScript(language, effective)
  if (scriptError)
    throw new Error(scriptError)

  const keywordLine = buildWakeWordKeywordLine(language, effective)
  const tokenError = validateKeywordLineTokens(keywordLine, getTokenSet(language))
  if (tokenError)
    throw new Error(tokenError)

  return { keyword: effective, keywordLine }
}

function persistKeywordsFile(language: string, encoded: EncodedWakeWord): string {
  const keywordsPath = getWakeWordKeywordsPath(language)
  writeFileSync(keywordsPath, `${encoded.keywordLine}\n`, 'utf-8')
  logger.info('已写入 userData keywords.txt', {
    language,
    keywordsPath,
    keyword: encoded.keyword,
    keywordLine: encoded.keywordLine,
  })
  return keywordsPath
}

/**
 * 将 keywords.txt 写入 userData，失败抛错（调用方应 fail IPC）
 *
 * @returns 写入的绝对路径
 */
export function writeWakeWordKeywordsFile(language: string, keyword: string): string {
  return persistKeywordsFile(language, encodeAndValidateWakeWord(language, keyword))
}

/**
 * 确保 userData 下存在与当前配置一致的 keywords.txt
 *
 * - 用于 detector 初始化 / reload 前
 * - 始终按 DB 中的关键词重写，避免与 DB 脱节
 * - 非法词直接抛错（IPC 保存路径）
 */
export function ensureWakeWordKeywordsFile(language: string, keyword?: string | null): string {
  return writeWakeWordKeywordsFile(language, resolveWakeWordKeyword(language, keyword))
}

export interface SafeKeywordsFileResult {
  keywordsPath: string
  keyword: string
  keywordLine: string
  fellBack: boolean
  reason?: string
}

/**
 * 启动用：非法自定义词回退默认词，避免 sherpa 原生 abort 导致无法打开。
 */
export function ensureSafeWakeWordKeywordsFile(
  language: string,
  keyword?: string | null,
): SafeKeywordsFileResult {
  try {
    const encoded = encodeAndValidateWakeWord(language, keyword)
    return {
      keywordsPath: persistKeywordsFile(language, encoded),
      keyword: encoded.keyword,
      keywordLine: encoded.keywordLine,
      fellBack: false,
    }
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    logger.error('自定义唤醒词无效，回退默认词', { language, keyword, reason })
    const fallback = resolveWakeWordKeyword(language, '')
    const encoded = encodeAndValidateWakeWord(language, fallback)
    return {
      keywordsPath: persistKeywordsFile(language, encoded),
      keyword: encoded.keyword,
      keywordLine: encoded.keywordLine,
      fellBack: true,
      reason,
    }
  }
}
