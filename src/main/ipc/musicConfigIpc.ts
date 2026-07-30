/**
 * 音乐配置 IPC 处理（createIpcHandler + IpcResult）
 */
import type { MusicConfig } from '@shared/types'
import { getDatabase } from '../services/database'
import { getLogger } from '../utils/logger'
import { createIpcHandler, success } from './middleware'

const logger = getLogger('MusicConfigIpc')

export function registerMusicConfigIpc(): void {
  const db = getDatabase()

  createIpcHandler({
    channel: 'music:get-config',
    handler: async () => {
      const dbConfig = db.getOrCreateMusicConfig()
      const config: MusicConfig = {
        searchUrl: dbConfig.search_url,
        urlApi: dbConfig.url_api,
        urlApiKey: dbConfig.url_api_key,
        urlResponsePath: dbConfig.url_response_path,
        lyricsUrl: dbConfig.lyrics_url,
        defaultSource: dbConfig.default_source,
        defaultQuality: dbConfig.default_quality,
      }
      logger.info('获取音乐配置:', config)
      return success(config)
    },
  })

  createIpcHandler({
    channel: 'music:update-config',
    schema: {
      updates: { type: 'object', required: true },
    },
    handler: async (_event, updatesUnknown: unknown) => {
      const updates = updatesUnknown as Partial<MusicConfig>
      logger.info('更新音乐配置:', updates)
      const dbUpdates: Record<string, string> = {}

      if (updates.searchUrl !== undefined)
        dbUpdates.search_url = updates.searchUrl
      if (updates.urlApi !== undefined)
        dbUpdates.url_api = updates.urlApi
      if (updates.urlApiKey !== undefined)
        dbUpdates.url_api_key = updates.urlApiKey
      if (updates.urlResponsePath !== undefined)
        dbUpdates.url_response_path = updates.urlResponsePath
      if (updates.lyricsUrl !== undefined)
        dbUpdates.lyrics_url = updates.lyricsUrl
      if (updates.defaultSource !== undefined)
        dbUpdates.default_source = updates.defaultSource
      if (updates.defaultQuality !== undefined)
        dbUpdates.default_quality = updates.defaultQuality

      db.updateMusicConfig(dbUpdates)
      logger.info('音乐配置更新成功')
      return success()
    },
  })

  logger.info('音乐配置 IPC 注册完成')
}
