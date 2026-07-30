import type { IpcContext } from '../types/ipc'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { getDatabase } from '../services/database'
import { BpeConverter } from '../utils/BpeConverter'
import { getLogger } from '../utils/logger'
import { PinyinConverter } from '../utils/PinyinConverter'
import { createIpcHandler, failure, success } from './middleware'

const logger = getLogger('WakeWordIpc')

/**
 * 注册唤醒词相关的 IPC 通道（createIpcHandler + IpcResult）
 */
export function registerWakeWordIpc(context: IpcContext): void {
  const db = getDatabase()

  createIpcHandler({
    channel: 'wake-word:get-config',
    handler: () => {
      const config = db.getFormattedWakeWordConfig()
      logger.info('获取唤醒词配置', config)
      return success(config)
    },
  })

  createIpcHandler({
    channel: 'wake-word:update-config',
    schema: {
      updates: { type: 'object', required: true },
    },
    handler: async (_event, updatesUnknown: unknown) => {
      const updates = updatesUnknown as {
        enabled?: boolean
        language?: string
        keyword?: string
        threshold?: number
        score?: number
        cooldownMs?: number
      }
      logger.info('更新唤醒词配置', updates)

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

      const currentLanguage = updates.language || db.getFormattedWakeWordConfig().language

      if (updates.keyword !== undefined && updates.keyword.trim() !== '') {
        const keyword = updates.keyword.trim()

        if (currentLanguage === 'zh') {
          dbUpdates.keyword_zh = keyword
        }
        else if (currentLanguage === 'en') {
          dbUpdates.keyword_en = keyword
        }

        try {
          const isDev = process.env.NODE_ENV === 'development'
          const modelsPath = isDev
            ? path.join(__dirname, '../../resources/wake-word-models')
            : path.join(process.resourcesPath, 'wake-word-models')

          const languageModelPath = path.join(modelsPath, currentLanguage)
          const keywordsPath = path.join(languageModelPath, 'keywords.txt')

          let keywordLine: string
          if (currentLanguage === 'zh') {
            keywordLine = PinyinConverter.toKeywordFormat(keyword)
          }
          else if (currentLanguage === 'en') {
            const tokensPath = path.join(languageModelPath, 'tokens.txt')
            keywordLine = BpeConverter.toKeywordFormat(keyword, tokensPath)
          }
          else {
            throw new Error(`不支持的语言: ${currentLanguage}`)
          }

          writeFileSync(keywordsPath, `${keywordLine}\n`, 'utf-8')
          logger.info(`已生成 keywords.txt: ${keywordsPath}`)
          logger.info(`唤醒词内容: ${keywordLine}`)
        }
        catch (fileError) {
          logger.error('生成 keywords.txt 失败:', fileError)
          logger.error('错误堆栈:', (fileError as Error).stack)
        }
      }

      db.updateWakeWordConfig(dbUpdates)

      const wakeWordPlugin = context.container?.getWakeWordPlugin()
      if (wakeWordPlugin && typeof wakeWordPlugin.reloadConfig === 'function') {
        await wakeWordPlugin.reloadConfig()
        logger.info('WakeWordPlugin 配置已重新加载')
      }
      else {
        logger.warn('WakeWordPlugin 不存在或不支持热重载')
      }

      logger.info('唤醒词配置更新成功')
      return success()
    },
  })

  createIpcHandler({
    channel: 'wake-word:test',
    handler: async () => {
      logger.info('测试唤醒词')
      const config = db.getFormattedWakeWordConfig()

      if (!context.container) {
        return failure('ServiceContainer 未初始化')
      }

      logger.info(`模拟检测到唤醒词: ${config.keyword}`)
      await context.container.startAutoConversation()
      // keyword 放在 data 内，preload 用 unwrapIpcResult 取 data
      return success({ keyword: config.keyword })
    },
  })

  logger.info('唤醒词相关 IPC 通道已注册')
}
