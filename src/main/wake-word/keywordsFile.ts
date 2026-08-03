/**
 * 唤醒词 keywords.txt 生成与落盘
 *
 * 模型 onnx/tokens 读打包目录；keywords.txt 只写 userData，避免安装包 Resources 只读导致
 * 自定义唤醒词保存成功但运行时仍用默认词。
 */

import { existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { BpeConverter } from '../utils/BpeConverter'
import { getLogger } from '../utils/logger'
import {
  getWakeWordKeywordsPath,
  getWakeWordModelsBundledDir,
} from '../utils/paths'
import { PinyinConverter } from '../utils/PinyinConverter'

const logger = getLogger('WakeWordKeywords')

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

/**
 * 将 keywords.txt 写入 userData，失败抛错（调用方应 fail IPC）
 *
 * @returns 写入的绝对路径
 */
export function writeWakeWordKeywordsFile(language: string, keyword: string): string {
  const effective = resolveWakeWordKeyword(language, keyword)
  const keywordLine = buildWakeWordKeywordLine(language, effective)
  const keywordsPath = getWakeWordKeywordsPath(language)

  writeFileSync(keywordsPath, `${keywordLine}\n`, 'utf-8')

  logger.info('已写入 userData keywords.txt', {
    language,
    keywordsPath,
    keyword: effective,
    keywordLine,
  })

  return keywordsPath
}

/**
 * 确保 userData 下存在与当前配置一致的 keywords.txt
 *
 * - 用于 detector 初始化 / reload 前
 * - 始终按 DB 中的关键词重写，避免与 DB 脱节
 */
export function ensureWakeWordKeywordsFile(language: string, keyword?: string | null): string {
  return writeWakeWordKeywordsFile(language, resolveWakeWordKeyword(language, keyword))
}
