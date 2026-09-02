/**
 * 唤醒词校验（纯函数，不碰 Electron / 文件系统）
 *
 * sherpa-onnx KeywordSpotter 对 keywords.txt 里不在 tokens.txt 的音节会直接
 * abort 进程（JS try/catch 接不住）。中英混写如「你好moss」会被拼音切成 `m oss`，
 * `oss` 不在中文词表里，保存或下次启动都会闪退。
 */

/** 中文：1–12 个汉字，不含英文/数字/符号/空格 */
export const ZH_KEYWORD_PATTERN = /^[一-鿿]{1,12}$/

/** 英文：1–4 个词，仅字母 */
export const EN_KEYWORD_PATTERN = /^[A-Za-z]{2,32}(?:\s+[A-Za-z]{1,32}){0,3}$/

export function parseTokensFile(content: string): Set<string> {
  const tokens = new Set<string>()
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed)
      continue
    const parts = trimmed.split(' ')
    if (parts.length >= 1 && parts[0])
      tokens.add(parts[0])
  }
  return tokens
}

/**
 * keywords 行里 @ 之前的音节/BPE token
 */
export function extractKeywordTokens(keywordLine: string): string[] {
  const at = keywordLine.indexOf('@')
  const tokenPart = (at === -1 ? keywordLine : keywordLine.slice(0, at)).trim()
  if (!tokenPart)
    return []
  return tokenPart.split(/\s+/).filter(Boolean)
}

export function isChineseKeyword(keyword: string): boolean {
  return ZH_KEYWORD_PATTERN.test(keyword.trim())
}

export function isEnglishKeyword(keyword: string): boolean {
  return EN_KEYWORD_PATTERN.test(keyword.trim())
}

/**
 * 按当前模型语言检查唤醒词脚本。返回错误文案，通过则 null。
 */
export function validateKeywordScript(language: string, keyword: string): string | null {
  const trimmed = keyword.trim()
  if (!trimmed)
    return '唤醒词不能为空'

  if (language === 'en') {
    if (isEnglishKeyword(trimmed))
      return null
    if (isChineseKeyword(trimmed))
      return '当前是英文模型，请改用中文模型，或改成纯英文唤醒词（例如 MOSS）'
    return '英文唤醒词只能包含字母和空格，例如 Hello Moss，不能夹杂汉字、数字或符号'
  }

  if (isChineseKeyword(trimmed))
    return null
  if (isEnglishKeyword(trimmed))
    return '当前是中文模型，请改用英文模型，或改成纯中文唤醒词（例如 你好小智）'
  return '中文唤醒词只能使用汉字，例如「你好小智」。中英混写（如「你好moss」）会导致无法启动'
}

/**
 * 检查 keywords 行的每个 token 都在模型词表中。
 * `<unk>` 或缺失音节都会让 sherpa 原生崩溃。
 */
export function validateKeywordLineTokens(
  keywordLine: string,
  tokenSet: Set<string>,
): string | null {
  const tokens = extractKeywordTokens(keywordLine)
  if (tokens.length === 0)
    return '唤醒词编码结果为空'

  for (const token of tokens) {
    if (token === '<unk>' || !tokenSet.has(token))
      return `唤醒词无法被当前模型编码（未知音节「${token}」），请换一个更常见的词`
  }
  return null
}
