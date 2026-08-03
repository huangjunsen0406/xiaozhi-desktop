import type { IpcContext } from '../types/ipc'
import { getDatabase } from '../services/database'
import { getLogger } from '../utils/logger'
import {
  ensureWakeWordKeywordsFile,
  resolveWakeWordKeyword,
} from '../wake-word/keywordsFile'
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

      const current = db.getFormattedWakeWordConfig()
      const raw = db.getOrCreateWakeWordConfig()

      // 1. 合并最终 language + keyword（再落盘 / 写库）
      const finalLanguage = updates.language ?? current.language ?? 'zh'

      let finalKeywordZh = raw.keyword_zh || ''
      let finalKeywordEn = raw.keyword_en || ''

      if (updates.keyword !== undefined && updates.keyword.trim() !== '') {
        const keyword = updates.keyword.trim()
        if (finalLanguage === 'zh') {
          finalKeywordZh = keyword
        }
        else if (finalLanguage === 'en') {
          finalKeywordEn = keyword
        }
      }

      const keywordForLanguage = finalLanguage === 'en' ? finalKeywordEn : finalKeywordZh
      const effectiveKeyword = resolveWakeWordKeyword(finalLanguage, keywordForLanguage)

      // 2. 先写 userData keywords.txt（失败则 IPC 失败，避免静默成功）
      //    语言切换、关键词变更、或仅改阈值时都保持文件与最终 language/keyword 一致
      try {
        ensureWakeWordKeywordsFile(finalLanguage, effectiveKeyword)
      }
      catch (fileError) {
        const message = fileError instanceof Error ? fileError.message : String(fileError)
        logger.error('写入 userData keywords.txt 失败', fileError)
        return failure(`写入唤醒词文件失败: ${message}`)
      }

      // 3. 再写 DB
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
      if (updates.keyword !== undefined && updates.keyword.trim() !== '') {
        if (finalLanguage === 'zh')
          dbUpdates.keyword_zh = updates.keyword.trim()
        else if (finalLanguage === 'en')
          dbUpdates.keyword_en = updates.keyword.trim()
      }

      try {
        db.updateWakeWordConfig(dbUpdates)
      }
      catch (dbError) {
        const message = dbError instanceof Error ? dbError.message : String(dbError)
        logger.error('更新唤醒词数据库失败', dbError)
        return failure(`更新唤醒词配置失败: ${message}`)
      }

      // 4. 文件与 DB 都 OK 后再热重载
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
