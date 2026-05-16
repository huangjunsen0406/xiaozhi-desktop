import type { IpcContext } from '../types/ipc'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { ipcMain } from 'electron'
import { DatabaseManager } from '../services/database'
import { BpeConverter } from '../utils/BpeConverter'
import { getLogger } from '../utils/logger'
import { PinyinConverter } from '../utils/PinyinConverter'

const logger = getLogger('WakeWordIpc')

/**
 * 注册唤醒词相关的 IPC 通道
 */
export function registerWakeWordIpc(context: IpcContext): void {
  const db = DatabaseManager.getInstance()

  /**
   * 获取唤醒词配置
   */
  ipcMain.handle('wake-word:get-config', () => {
    try {
      const config = db.getFormattedWakeWordConfig()
      logger.info('获取唤醒词配置', config)
      return { success: true, data: config }
    }
    catch (error) {
      logger.error('获取唤醒词配置失败', error)
      return { success: false, error: String(error) }
    }
  })

  /**
   * 更新唤醒词配置
   */
  ipcMain.handle('wake-word:update-config', async (_, updates: {
    enabled?: boolean
    language?: string
    keyword?: string
    threshold?: number
    score?: number
    cooldownMs?: number
  }) => {
    try {
      logger.info('更新唤醒词配置', updates)

      // 转换前端字段名到数据库字段名
      const dbUpdates: {
        enabled?: boolean
        language?: string
        threshold?: number
        score?: number
        cooldown_ms?: number
        keyword_zh?: string
        keyword_en?: string
      } = {}
      if (updates.enabled !== undefined)
        dbUpdates.enabled = updates.enabled
      if (updates.language !== undefined)
        dbUpdates.language = updates.language
      if (updates.threshold !== undefined)
        dbUpdates.threshold = updates.threshold
      if (updates.score !== undefined)
        dbUpdates.score = updates.score
      if (updates.cooldownMs !== undefined)
        dbUpdates.cooldown_ms = updates.cooldownMs

      // 获取当前语言（可能刚切换）
      const currentLanguage = updates.language || db.getFormattedWakeWordConfig().language

      // 如果更新了唤醒词，保存到对应语言的字段并生成 keywords.txt
      if (updates.keyword !== undefined && updates.keyword.trim() !== '') {
        const keyword = updates.keyword.trim()

        // 保存到对应语言的字段（中英文分别保存，切换时不丢失）
        if (currentLanguage === 'zh') {
          dbUpdates.keyword_zh = keyword
        }
        else if (currentLanguage === 'en') {
          dbUpdates.keyword_en = keyword
        }

        // 生成 keywords.txt 文件
        try {
          // 确定模型路径
          const isDev = process.env.NODE_ENV === 'development'
          const modelsPath = isDev
            ? path.join(__dirname, '../../resources/wake-word-models')
            : path.join(process.resourcesPath, 'wake-word-models')

          const languageModelPath = path.join(modelsPath, currentLanguage)
          const keywordsPath = path.join(languageModelPath, 'keywords.txt')

          // 根据语言选择转换器
          let keywordLine: string
          if (currentLanguage === 'zh') {
            // 中文：使用拼音转换
            keywordLine = PinyinConverter.toKeywordFormat(keyword)
          }
          else if (currentLanguage === 'en') {
            // 英文：使用 BPE 转换
            const tokensPath = path.join(languageModelPath, 'tokens.txt')
            keywordLine = BpeConverter.toKeywordFormat(keyword, tokensPath)
          }
          else {
            throw new Error(`不支持的语言: ${currentLanguage}`)
          }

          // 写入文件
          writeFileSync(keywordsPath, `${keywordLine}\n`, 'utf-8')
          logger.info(`已生成 keywords.txt: ${keywordsPath}`)
          logger.info(`唤醒词内容: ${keywordLine}`)
        }
        catch (fileError) {
          logger.error('生成 keywords.txt 失败:', fileError)
          logger.error('错误堆栈:', (fileError as Error).stack)
          // 不影响主流程，继续执行
        }
      }

      // 更新数据库
      db.updateWakeWordConfig(dbUpdates)

      // 通知 WakeWordPlugin 重新加载配置
      const wakeWordPlugin = context.container?.getWakeWordPlugin()
      if (wakeWordPlugin && typeof wakeWordPlugin.reloadConfig === 'function') {
        await wakeWordPlugin.reloadConfig()
        logger.info('WakeWordPlugin 配置已重新加载')
      }
      else {
        logger.warn('WakeWordPlugin 不存在或不支持热重载')
      }

      logger.info('唤醒词配置更新成功')
      return { success: true }
    }
    catch (error) {
      logger.error('更新唤醒词配置失败', error)
      return { success: false, error: String(error) }
    }
  })

  /**
   * 测试唤醒词（模拟触发）
   */
  ipcMain.handle('wake-word:test', async () => {
    try {
      logger.info('测试唤醒词')

      // 获取当前配置的唤醒词
      const config = db.getFormattedWakeWordConfig()

      // 模拟唤醒词检测（触发自动对话）
      if (context.container) {
        logger.info(`模拟检测到唤醒词: ${config.keyword}`)
        await context.container.startAutoConversation()
        return { success: true, keyword: config.keyword }
      }
      else {
        return { success: false, error: 'ServiceContainer 未初始化' }
      }
    }
    catch (error) {
      logger.error('测试唤醒词失败', error)
      return { success: false, error: String(error) }
    }
  })

  logger.info('唤醒词相关 IPC 通道已注册')
}
