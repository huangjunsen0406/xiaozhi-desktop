/**
 * 音乐配置 IPC 处理（createIpcHandler + IpcResult）
 */
import type { MusicConfig } from '@shared/types'
import type { DatabaseManager } from '../services/database'
import { getDatabase } from '../services/database'
import { getLogger } from '../utils/logger'
import { createIpcHandler, success } from './middleware'
import { optionalString, parseObject } from './middleware/validation'

const logger = getLogger('MusicConfigIpc')

function parseMusicUpdate(value: unknown): Partial<MusicConfig> {
  const input = parseObject(value)
  return {
    searchUrl: optionalString(input, 'searchUrl'),
    urlApi: optionalString(input, 'urlApi'),
    urlApiKey: optionalString(input, 'urlApiKey'),
    urlResponsePath: optionalString(input, 'urlResponsePath'),
    lyricsUrl: optionalString(input, 'lyricsUrl'),
    defaultSource: optionalString(input, 'defaultSource'),
    defaultQuality: optionalString(input, 'defaultQuality'),
  }
}

function musicUpdateToDb(updates: Partial<MusicConfig>): Parameters<DatabaseManager['updateMusicConfig']>[0] {
  return {
    search_url: updates.searchUrl,
    url_api: updates.urlApi,
    url_api_key: updates.urlApiKey,
    url_response_path: updates.urlResponsePath,
    lyrics_url: updates.lyricsUrl,
    default_source: updates.defaultSource,
    default_quality: updates.defaultQuality,
  }
}

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
      const updates = parseMusicUpdate(updatesUnknown)
      db.updateMusicConfig(musicUpdateToDb(updates))
      logger.info('音乐配置更新成功')
      return success()
    },
  })

  logger.info('音乐配置 IPC 注册完成')
}
