/**
 * 音乐播放器服务
 * 管理音乐播放状态，通过 IPC 与渲染进程通信
 * 使用酷我搜索 + 落雪音乐直链 API
 */

import type {
  GetLyricsResult,
  GetStatusResult,
  MusicPlatform,
  MusicSearchResult,
  MusicStatus,
  PauseMusicResult,
  PlaybackState,
  PlayMusicResult,
  ResumeMusicResult,
  SearchMusicResult,
  SeekResult,
  SetLoopResult,
  SetPlaybackRateResult,
  SetVolumeResult,
  StopMusicResult,
} from './types'
import { getDatabase } from '../../../services/database'
import { getLogger } from '../../../utils/logger'
import { ensureBackgroundAudioWindow } from '../../../windows/windowManager'

const logger = getLogger('MusicPlayer')

/** 音乐配置接口 */
interface MusicConfig {
  searchUrl: string
  urlApi: string
  urlApiKey: string
  urlResponsePath: string
  lyricsUrl: string
  defaultSource: string
  defaultQuality: string
}

/** 默认音乐配置 */
const DEFAULT_MUSIC_CONFIG: MusicConfig = {
  searchUrl: 'http://search.kuwo.cn/r.s',
  urlApi: 'https://lxmusicapi.onrender.com',
  urlApiKey: 'share-v3',
  urlResponsePath: 'data.url',
  lyricsUrl: 'http://m.kuwo.cn/newh5/singles/songinfoandlrc',
  defaultSource: 'kw',
  defaultQuality: '320k',
}

/**
 * 按点分路径从对象中提取值（无 any：逐级收窄为对象再索引）
 */
function getByPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, key) => {
    if (o === null || o === undefined)
      return undefined
    if (typeof o !== 'object')
      return undefined
    return (o as Record<string, unknown>)[key]
  }, obj)
}

/**
 * 音乐播放器服务（容器持有，显式 create，禁止懒 getInstance）
 */
export class MusicPlayer {
  // 当前播放状态
  private currentState: PlaybackState = 'idle'
  private currentFile: string | null = null
  private currentTime = 0
  private duration = 0
  private volume = 70
  private loop = false
  private playbackRate = 1.0
  private error: string | undefined

  private constructor() {
    logger.info('音乐播放器初始化')
  }

  /**
   * 显式创建实例（由 container / pluginWiring 持有）
   */
  static create(): MusicPlayer {
    return new MusicPlayer()
  }

  /**
   * 获取音乐配置（从数据库读取，带默认值）
   */
  private getMusicConfig(): MusicConfig {
    try {
      const dbConfig = getDatabase().getOrCreateMusicConfig()
      return {
        searchUrl: dbConfig.search_url || DEFAULT_MUSIC_CONFIG.searchUrl,
        urlApi: dbConfig.url_api || DEFAULT_MUSIC_CONFIG.urlApi,
        urlApiKey: dbConfig.url_api_key || DEFAULT_MUSIC_CONFIG.urlApiKey,
        urlResponsePath: dbConfig.url_response_path || DEFAULT_MUSIC_CONFIG.urlResponsePath,
        lyricsUrl: dbConfig.lyrics_url || DEFAULT_MUSIC_CONFIG.lyricsUrl,
        defaultSource: dbConfig.default_source || DEFAULT_MUSIC_CONFIG.defaultSource,
        defaultQuality: dbConfig.default_quality || DEFAULT_MUSIC_CONFIG.defaultQuality,
      }
    }
    catch (error) {
      logger.warn('读取音乐配置失败，使用默认值', error)
      return { ...DEFAULT_MUSIC_CONFIG }
    }
  }

  /**
   * 播放音乐
   */
  async play(
    filePath: string,
    startPosition = 0,
    metadata?: { name?: string, artist?: string, album?: string },
  ): Promise<PlayMusicResult> {
    try {
      logger.info(`播放音乐: ${filePath}, 起始位置: ${startPosition}秒`)
      if (metadata?.name) {
        logger.info(`歌曲信息: ${metadata.name} - ${metadata.artist || '未知歌手'}`)
      }

      // 更新状态
      this.currentState = 'loading'
      this.currentFile = filePath
      this.currentTime = startPosition
      this.error = undefined

      // 构建歌曲信息
      const songInfo: { name?: string, artist?: string, album?: string, platform?: string } = {
        name: metadata?.name,
        artist: metadata?.artist,
        album: metadata?.album,
        platform: this.getMusicConfig().defaultSource,
      }

      // 发送播放指令到渲染进程
      const success = await this.sendCommand('play', {
        filePath,
        startPosition,
        volume: this.volume,
        loop: this.loop,
        playbackRate: this.playbackRate,
      })

      if (success) {
        logger.info(`播放指令已发送`)
        return {
          success: true,
          message: '播放指令已发送',
          file: filePath,
          startPosition,
          songInfo: Object.keys(songInfo).some(k => songInfo[k as keyof typeof songInfo]) ? songInfo : undefined,
        }
      }
      else {
        this.currentState = 'error'
        this.error = '发送播放指令失败'
        return {
          success: false,
          message: '发送播放指令失败',
        }
      }
    }
    catch (error) {
      logger.error('播放音乐失败', error)
      this.currentState = 'error'
      this.error = error instanceof Error ? error.message : '未知错误'
      return {
        success: false,
        message: this.error,
      }
    }
  }

  /**
   * 统一执行播放控制类 IPC 指令，消除 pause/resume/stop/setVolume/seek/setLoop/setPlaybackRate 重复样板。
   */
  private async runControlCommand<TExtra extends Record<string, unknown> = Record<string, never>>(
    command: string,
    options: {
      args?: Record<string, unknown>
      actionLabel: string
      successMessage: string
      onSuccess?: () => TExtra | void
    },
  ): Promise<{ success: boolean, message: string } & Partial<TExtra>> {
    try {
      logger.info(options.actionLabel)
      const ok = await this.sendCommand(command, options.args)
      if (!ok) {
        return { success: false, message: `${options.actionLabel}失败` } as {
          success: boolean
          message: string
        } & Partial<TExtra>
      }

      const extra = options.onSuccess?.()
      return {
        success: true,
        message: options.successMessage,
        ...(extra ?? {}),
      } as { success: boolean, message: string } & Partial<TExtra>
    }
    catch (error) {
      logger.error(`${options.actionLabel}失败`, error)
      return {
        success: false,
        message: error instanceof Error ? error.message : `${options.actionLabel}失败`,
      } as { success: boolean, message: string } & Partial<TExtra>
    }
  }

  async pause(): Promise<PauseMusicResult> {
    if (this.currentState !== 'playing')
      return { success: false, message: '当前没有正在播放的音乐' }
    return this.runControlCommand('pause', {
      actionLabel: '暂停播放',
      successMessage: '暂停指令已发送',
      onSuccess: () => ({ currentTime: this.currentTime }),
    })
  }

  async resume(): Promise<ResumeMusicResult> {
    if (this.currentState !== 'paused')
      return { success: false, message: '当前没有暂停的音乐' }
    return this.runControlCommand('resume', {
      actionLabel: '恢复播放',
      successMessage: '恢复播放指令已发送',
    })
  }

  async stop(): Promise<StopMusicResult> {
    if (this.currentState === 'idle' || this.currentState === 'stopped')
      return { success: false, message: '当前没有播放中的音乐' }
    return this.runControlCommand('stop', {
      actionLabel: '停止播放',
      successMessage: '停止播放指令已发送',
    })
  }

  async setVolume(volume: number): Promise<SetVolumeResult> {
    if (volume < 0 || volume > 100)
      return { success: false, message: `音量值必须在 0-100 之间，当前值: ${volume}` }
    return this.runControlCommand('setVolume', {
      args: { volume },
      actionLabel: `设置音量: ${volume}`,
      successMessage: `音量已设置为 ${volume}`,
      onSuccess: () => {
        this.volume = volume
        return { volume }
      },
    })
  }

  async seek(position: number): Promise<SeekResult> {
    if (this.currentState === 'idle' || this.currentState === 'stopped')
      return { success: false, message: '当前没有播放中的音乐' }
    if (position < 0)
      return { success: false, message: `位置必须为非负数，当前值: ${position}` }
    return this.runControlCommand('seek', {
      args: { position },
      actionLabel: `跳转到: ${position}秒`,
      successMessage: `跳转指令已发送到 ${position.toFixed(1)} 秒`,
      onSuccess: () => ({ position }),
    })
  }

  async setLoop(loop: boolean): Promise<SetLoopResult> {
    return this.runControlCommand('setLoop', {
      args: { loop },
      actionLabel: `设置循环播放: ${loop}`,
      successMessage: loop ? '已开启循环播放' : '已关闭循环播放',
      onSuccess: () => {
        this.loop = loop
        return { loop }
      },
    })
  }

  async setPlaybackRate(rate: number): Promise<SetPlaybackRateResult> {
    if (rate < 0.5 || rate > 2.0)
      return { success: false, message: `播放速度必须在 0.5-2.0 之间，当前值: ${rate}` }
    return this.runControlCommand('setPlaybackRate', {
      args: { rate },
      actionLabel: `设置播放速度: ${rate}`,
      successMessage: `播放速度已设置为 ${rate}x`,
      onSuccess: () => {
        this.playbackRate = rate
        return { rate }
      },
    })
  }

  /**
   * 获取当前播放状态
   */
  async getStatus(): Promise<GetStatusResult> {
    try {
      const status: MusicStatus = {
        state: this.currentState,
        currentFile: this.currentFile,
        currentTime: this.currentTime,
        duration: this.duration,
        volume: this.volume,
        loop: this.loop,
        playbackRate: this.playbackRate,
        error: this.error,
      }

      return {
        success: true,
        status,
      }
    }
    catch (error) {
      logger.error('获取状态失败', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : '获取状态失败',
      }
    }
  }

  /**
   * 更新播放状态（由渲染进程回调）
   */
  updateStatus(status: Partial<MusicStatus>): void {
    if (status.state !== undefined) {
      this.currentState = status.state
    }
    if (status.currentTime !== undefined) {
      this.currentTime = status.currentTime
    }
    if (status.duration !== undefined) {
      this.duration = status.duration
    }
    if (status.error !== undefined) {
      this.error = status.error
    }
  }

  /**
   * 搜索音乐（酷我搜索 API）
   */
  async search(keyword: string, _platform: MusicPlatform = 'kuwo', limit = 20): Promise<SearchMusicResult> {
    try {
      logger.info(`搜索音乐: ${keyword}`)

      const config = this.getMusicConfig()
      const keywordEncoded = encodeURIComponent(keyword)

      const searchUrl = `${config.searchUrl}?client=kt&all=${keywordEncoded}&pn=0&rn=${limit}`
        + `&uid=794762570&ver=kwplayer_ar_9.2.2.1&vipver=1`
        + `&show_copyright_off=1&newver=1&ft=music&cluster=0`
        + `&strategy=2012&encoding=utf8&rformat=json&vermerge=1`
        + `&mobi=1&issubtitle=1`

      logger.info(`请求 URL: ${searchUrl}`)

      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Connection': 'keep-alive',
      }

      // 搜索超时重试，最多 2 次
      let response: Response | null = null
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          response = await this.fetchWithTimeout(searchUrl, headers, 10000)
          break
        }
        catch (err) {
          if (attempt < 2) {
            logger.warn(`搜索超时，重试 (${attempt + 1}/2)`)
            continue
          }
          throw new Error(`搜索超时，已重试 2 次: ${err instanceof Error ? err.message : '未知错误'}`)
        }
      }

      if (!response || !response.ok) {
        throw new Error(`HTTP ${response?.status}: ${response?.statusText}`)
      }

      const data = await response.json() as {
        abslist?: Array<{
          MUSICRID: string
          SONGNAME: string
          ARTIST: string
          ALBUM: string
          DURATION: string
        }>
      }

      const abslist = data.abslist || []
      if (abslist.length === 0) {
        return {
          success: true,
          message: `未找到与 "${keyword}" 相关的歌曲`,
          keyword,
          total: 0,
          results: [],
        }
      }

      // 映射为兼容的 MusicSearchResult 格式
      const results: MusicSearchResult[] = abslist.map((item) => {
        const songId = item.MUSICRID ? item.MUSICRID.replace('MUSIC_', '') : ''
        return {
          id: songId,
          name: item.SONGNAME || '',
          artist: item.ARTIST || '',
          album: item.ALBUM || '',
          url: '', // URL 需要通过 resolvePlayUrl 解析
          pic: '',
          lrc: '',
          platform: 'kuwo' as MusicPlatform,
        }
      })

      logger.info(`搜索到 ${results.length} 首歌曲`)

      return {
        success: true,
        message: `找到 ${results.length} 首歌曲`,
        keyword,
        total: results.length,
        results,
      }
    }
    catch (error) {
      logger.error('搜索音乐失败', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : '搜索音乐失败',
      }
    }
  }

  private async fetchWithTimeout(
    url: string,
    headers: Record<string, string>,
    timeoutMs: number,
  ): Promise<Response> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await fetch(url, { headers, signal: controller.signal })
    }
    finally {
      clearTimeout(timeoutId)
    }
  }

  /**
   * 解析实际播放 URL（落雪音乐直链 API）
   */
  async resolvePlayUrl(songId: string): Promise<string | null> {
    try {
      const config = this.getMusicConfig()
      const apiUrl = `${config.urlApi}/url/${config.defaultSource}/${songId}/${config.defaultQuality}`
      logger.info(`解析直链: ${apiUrl}`)

      const response = await this.fetchWithTimeout(apiUrl, {
        'X-Request-Key': config.urlApiKey,
        'User-Agent': 'lx-music-request',
      }, 15000)

      if (!response.ok) {
        logger.error(`直链 API 返回错误: HTTP ${response.status}`)
        return null
      }

      const data = await response.json() as Record<string, unknown>
      const candidates = [config.urlResponsePath || 'data.url', 'url', 'data.url', 'data']
      const realUrl = candidates
        .map(path => getByPath(data, path))
        .find((val): val is string => typeof val === 'string' && val.startsWith('http'))
        ?? null

      if (!realUrl) {
        logger.error(`未能从直链 API 提取播放 URL: ${JSON.stringify(data)}`)
        return null
      }

      logger.info(`解析到播放地址: ${realUrl.substring(0, 80)}...`)
      return realUrl
    }
    catch (error) {
      logger.error('解析播放 URL 失败', error)
      return null
    }
  }

  /**
   * 获取歌词（酷我歌词 API）
   */
  async getLyrics(songId: string, _platform: MusicPlatform = 'kuwo'): Promise<GetLyricsResult> {
    try {
      logger.info(`获取歌词: ID=${songId}`)
      const config = this.getMusicConfig()
      const url = `${config.lyricsUrl}?musicId=${songId}`

      const response = await this.fetchWithTimeout(url, {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
      }, 10000)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json() as {
        status?: number
        data?: {
          lrclist?: Array<{
            time: string
            lineLyric: string
          }>
        }
      }

      if (data.status !== 200) {
        return { success: false, message: '该歌曲暂无歌词' }
      }

      const lrclist = data.data?.lrclist
      if (!lrclist || lrclist.length === 0) {
        return { success: false, message: '未找到歌词' }
      }

      const lrcLines: string[] = []
      for (const item of lrclist) {
        const text = item.lineLyric?.trim()
        if (!text || !item.time)
          continue

        const timeSec = Number.parseFloat(item.time)
        if (Number.isNaN(timeSec))
          continue

        const minutes = Math.floor(timeSec / 60)
        const seconds = timeSec - minutes * 60
        const timeTag = `[${String(minutes).padStart(2, '0')}:${seconds.toFixed(2).padStart(5, '0')}]`
        lrcLines.push(`${timeTag} ${text}`)
      }

      if (lrcLines.length === 0) {
        return { success: false, message: '未找到歌词' }
      }

      const lyrics = lrcLines.join('\n')
      logger.info(`歌词获取成功，共 ${lrcLines.length} 行`)
      return { success: true, message: '歌词获取成功', lyrics }
    }
    catch (error) {
      logger.error('获取歌词失败', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : '获取歌词失败',
      }
    }
  }

  /**
   * 发送指令到渲染进程
   */
  private async sendCommand(command: string, args?: Record<string, unknown>): Promise<boolean> {
    try {
      // 获取后台音频窗口（音乐播放器在这个窗口中）
      const audioWindow = ensureBackgroundAudioWindow()

      // 等待 webContents 准备就绪
      if (!audioWindow.webContents) {
        logger.error('webContents 不可用')
        return false
      }

      // 等待页面加载完成
      if (audioWindow.webContents.isLoading()) {
        logger.info('等待后台音频窗口加载完成...')
        await new Promise<void>((resolve) => {
          audioWindow.webContents.once('did-finish-load', () => {
            logger.info('后台音频窗口加载完成')
            resolve()
          })
        })
      }

      const message = { command, args }
      logger.info('发送 IPC 消息到后台音频窗口:', message)

      if (audioWindow.isDestroyed()) {
        logger.warn('后台音频窗口已销毁，无法发送指令')
        return false
      }

      audioWindow.webContents.send('music:command', message)

      return true
    }
    catch (error) {
      logger.error('发送指令失败', error)
      return false
    }
  }
}
