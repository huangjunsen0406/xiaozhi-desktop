import { readFileSync } from 'node:fs'
import { createLogger } from './logger'

const logger = createLogger('BpeConverter')

/**
 * BPE 转换工具类
 * 用于将英文转换为 sherpa-onnx BPE keyword 格式
 */
export class BpeConverter {
  private static tokenToId: Map<string, number> | null = null
  private static idToToken: Map<number, string> | null = null

  /**
   * 加载 tokens.txt 文件
   */
  private static loadTokens(tokensPath: string): void {
    if (this.tokenToId && this.idToToken) {
      return // 已加载
    }

    const content = readFileSync(tokensPath, 'utf-8')
    const lines = content.trim().split('\n')

    this.tokenToId = new Map()
    this.idToToken = new Map()

    for (const line of lines) {
      const parts = line.split(' ')
      if (parts.length >= 2) {
        const token = parts[0]
        const id = Number.parseInt(parts[parts.length - 1], 10)
        this.tokenToId.set(token, id)
        this.idToToken.set(id, token)
      }
    }

    logger.info(`已加载 ${this.tokenToId.size} 个 BPE tokens`)
  }

  /**
   * 贪心匹配 BPE tokens
   * 从最长的 token 开始匹配
   */
  private static greedyTokenize(text: string, tokenToId: Map<string, number>): string[] {
    const tokens: string[] = []
    let i = 0

    while (i < text.length) {
      let matched = false

      // 从最长可能的 token 开始尝试（最多20个字符）
      const maxLen = Math.min(20, text.length - i)
      for (let len = maxLen; len >= 1; len--) {
        const substr = text.slice(i, i + len)

        if (tokenToId.has(substr)) {
          tokens.push(substr)
          i += len
          matched = true
          break
        }
      }

      // 如果没有匹配到，尝试单个字符
      if (!matched) {
        const char = text[i]
        if (tokenToId.has(char)) {
          tokens.push(char)
        }
        else {
          // 使用 <unk> token
          tokens.push('<unk>')
        }
        i++
      }
    }

    return tokens
  }

  /**
   * 将英文文本转换为 BPE keyword 格式
   * @param englishText 英文文本，如 "HELLO WORLD"
   * @param tokensPath tokens.txt 文件路径
   * @returns BPE keyword 格式，如 "▁HE LL O ▁WORLD @HELLO WORLD"
   *
   * @example
   * toKeywordFormat('HELLO WORLD', '/path/to/tokens.txt') => '▁HE LL O ▁WORLD @HELLO WORLD'
   * toKeywordFormat('HEY SIRI', '/path/to/tokens.txt') => '▁HE Y ▁S IR I @HEY SIRI'
   */
  static toKeywordFormat(englishText: string, tokensPath: string): string {
    // 1. 加载 tokens
    this.loadTokens(tokensPath)

    if (!this.tokenToId) {
      throw new Error('Failed to load BPE tokens')
    }

    // 2. 预处理：转大写，添加词边界标记
    const normalized = englishText.trim().toUpperCase()
    const words = normalized.split(/\s+/)

    // 3. 为每个单词添加 ▁ 前缀（空格标记）
    const processedWords = words.map(word => `▁${word}`)

    // 4. 对每个单词进行 BPE 分词
    const allTokens: string[] = []
    for (const word of processedWords) {
      const tokens = this.greedyTokenize(word, this.tokenToId)
      allTokens.push(...tokens)
    }

    // 5. 返回格式：BPE tokens @原始文本（遵循 sherpa-onnx 官方格式）
    const bpeTokens = allTokens.join(' ')
    return `${bpeTokens} @${englishText.trim().toUpperCase()}`
  }

  /**
   * 批量转换英文列表为 BPE keyword 格式
   * @param englishList 英文列表
   * @param tokensPath tokens.txt 文件路径
   * @returns BPE keyword 格式列表
   */
  static batchToKeywordFormat(englishList: string[], tokensPath: string): string[] {
    return englishList
      .filter(text => text.trim() !== '')
      .map(text => this.toKeywordFormat(text.trim(), tokensPath))
  }

  /**
   * 生成 keywords.txt 文件内容
   * @param englishList 英文列表
   * @param tokensPath tokens.txt 文件路径
   * @returns keywords.txt 文件内容
   */
  static generateKeywordsFile(englishList: string[], tokensPath: string): string {
    const keywordLines = this.batchToKeywordFormat(englishList, tokensPath)
    return `${keywordLines.join('\n')}\n`
  }
}
