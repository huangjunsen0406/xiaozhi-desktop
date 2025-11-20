import { pinyin } from 'pinyin'

/**
 * 拼音转换工具类
 * 用于将中文转换为 sherpa-onnx keyword 格式
 */
export class PinyinConverter {
  // 23 个声母表（按长度倒序排列，优先匹配 zh/ch/sh）
  private static readonly INITIALS = [
    'zh',
    'ch',
    'sh', // 翘舌音（2字符，优先匹配）
    'b',
    'p',
    'm',
    'f', // 唇音
    'd',
    't',
    'n',
    'l', // 舌尖音
    'g',
    'k',
    'h', // 舌根音
    'j',
    'q',
    'x', // 舌面音
    'r',
    'z',
    'c',
    's', // 其他
    'y',
    'w', // 零声母标记
  ]

  /**
   * 将拼音按声母韵母分隔
   * @example
   * splitPinyin('xiǎo') => ['x', 'iǎo']
   * splitPinyin('mǐ') => ['m', 'ǐ']
   * splitPinyin('ān') => ['ān'] // 零声母
   */
  private static splitPinyin(py: string): string[] {
    // 按长度倒序尝试匹配声母
    for (const initial of this.INITIALS) {
      if (py.startsWith(initial)) {
        const final = py.slice(initial.length)
        if (final) {
          return [initial, final]
        }
        else {
          // 只有声母，没有韵母（少见）
          return [initial]
        }
      }
    }

    // 没有声母（零声母），整个拼音就是韵母
    return [py]
  }

  /**
   * 将中文转换为 keyword 格式
   * @param chineseText 中文文本，如 "你好小智"
   * @returns keyword 格式，如 "n ǐ h ǎo x iǎo zh ì @你好小智"
   *
   * @example
   * toKeywordFormat('小米小米') => 'x iǎo m ǐ x iǎo m ǐ @小米小米'
   * toKeywordFormat('你好小智') => 'n ǐ h ǎo x iǎo zh ì @你好小智'
   */
  static toKeywordFormat(chineseText: string): string {
    // 1. 使用 pinyin 库转换为带声调拼音
    // pinyin(text, { style: pinyin.STYLE_TONE })
    // 返回格式：[['nǐ'], ['hǎo'], ['xiǎo'], ['zhì']]
    const pinyinArray = pinyin(chineseText, {
      style: pinyin.STYLE_TONE, // 带声调的拼音
      heteronym: false, // 不返回多音字，使用最常见的读音
    })

    // 2. 拼音列表扁平化
    const pinyinList = pinyinArray.map(p => p[0])

    // 3. 分割每个拼音（声母 + 韵母）
    const splitParts: string[] = []
    for (const py of pinyinList) {
      const parts = this.splitPinyin(py)
      splitParts.push(...parts)
    }

    // 4. 拼接结果：声母 韵母... @中文
    const pinyinStr = splitParts.join(' ')
    return `${pinyinStr} @${chineseText}`
  }

  /**
   * 从 keyword 行提取中文部分
   * @param keywordLine keyword 行，如 "n ǐ h ǎo @你好"
   * @returns 中文部分，如 "你好"
   */
  static extractChinese(keywordLine: string): string | null {
    const atIndex = keywordLine.indexOf('@')
    if (atIndex === -1) {
      return null
    }
    return keywordLine.slice(atIndex + 1).trim()
  }

  /**
   * 批量转换中文列表为 keyword 格式
   * @param chineseList 中文列表
   * @returns keyword 格式列表
   */
  static batchToKeywordFormat(chineseList: string[]): string[] {
    return chineseList
      .filter(text => text.trim() !== '')
      .map(text => this.toKeywordFormat(text.trim()))
  }

  /**
   * 从 keywords.txt 内容解析中文列表
   * @param keywordsContent keywords.txt 文件内容
   * @returns 中文列表
   */
  static parseKeywordsFile(keywordsContent: string): string[] {
    const chineseList: string[] = []

    const lines = keywordsContent.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      // 跳过空行和注释
      if (trimmed === '' || trimmed.startsWith('#')) {
        continue
      }

      const chinese = this.extractChinese(trimmed)
      if (chinese) {
        chineseList.push(chinese)
      }
    }

    return chineseList
  }

  /**
   * 生成 keywords.txt 文件内容
   * @param chineseList 中文列表
   * @returns keywords.txt 文件内容
   */
  static generateKeywordsFile(chineseList: string[]): string {
    const keywordLines = this.batchToKeywordFormat(chineseList)
    return `${keywordLines.join('\n')}\n`
  }
}
