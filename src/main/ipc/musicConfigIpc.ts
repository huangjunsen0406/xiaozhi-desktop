/**
 * 音乐配置 IPC 处理
 */
import type { MusicConfig } from '@shared/types'
import { ipcMain } from 'electron'
import { getDatabase } from '../services/database'
import { getLogger } from '../utils/logger'

const logger = getLogger('MusicConfigIpc')

export function registerMusicConfigIpc(): void {
  const db = getDatabase()

  /**
   * 获取音乐配置
   */
  ipcMain.handle('music:get-config', async () => {
    try {
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
      return { success: true, data: config }
    }
    catch (error) {
      logger.error('获取音乐配置失败:', error)
      return { success: false, error: String(error) }
    }
  })

  /**
   * 更新音乐配置
   */
  ipcMain.handle('music:update-config', async (_event, updates: Partial<MusicConfig>) => {
    try {
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
      return { success: true }
    }
    catch (error) {
      logger.error('更新音乐配置失败:', error)
      return { success: false, error: String(error) }
    }
  })

  logger.info('音乐配置 IPC 注册完成')
}
