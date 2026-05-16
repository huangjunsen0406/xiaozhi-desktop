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
import { DatabaseManager } from '../../../services/database'
import { getLogger } from '../../../utils/logger'
import { ensureBackgroundAudioWindow } from '../../../windows/windowManager'

const logger = getLogger('MusicPlayer')

/** 音乐配置接口 */
interface MusicConfig {
  searchUrl: string
  urlApi: string
  urlApiKey: string
  lyricsUrl: string
  defaultSource: string
  defaultQuality: string
}

/** 默认音乐配置 */
const DEFAULT_MUSIC_CONFIG: MusicConfig = {
  searchUrl: 'http://search.kuwo.cn/r.s',
  urlApi: 'https://lxmusicapi.onrender.com',
  urlApiKey: 'share-v3',
  lyricsUrl: 'http://m.kuwo.cn/newh5/singles/songinfoandlrc',
  defaultSource: 'kw',
  defaultQuality: '320k',
}

/**
 * 音乐播放器服务（单例）
 */
export class MusicPlayer {
  private static instance: MusicPlayer | null = null

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
   * 获取单例实例
   */
  static getInstance(): MusicPlayer {
    if (!MusicPlayer.instance) {
      MusicPlayer.instance = new MusicPlayer()
    }
    return MusicPlayer.instance
  }

  /**
   * 获取音乐配置（从数据库读取，带默认值）
   */
  private getMusicConfig(): MusicConfig {
    try {
      const db = DatabaseManager.getInstance()
      const dbConfig = db.getMusicConfig()
      if (!dbConfig) {
        return { ...DEFAULT_MUSIC_CONFIG }
      }
      return {
        searchUrl: dbConfig.search_url || DEFAULT_MUSIC_CONFIG.searchUrl,
        urlApi: dbConfig.url_api || DEFAULT_MUSIC_CONFIG.urlApi,
        urlApiKey: dbConfig.url_api_key || DEFAULT_MUSIC_CONFIG.urlApiKey,
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
   * 暂停播放
   */
  async pause(): Promise<PauseMusicResult> {
    try {
      if (this.currentState !== 'playing') {
        return {
          success: false,
          message: '当前没有正在播放的音乐',
        }
      }

      logger.info('暂停播放')

      const success = await this.sendCommand('pause')

      if (success) {
        return {
          success: true,
          message: '暂停指令已发送',
          currentTime: this.currentTime,
        }
      }
      else {
        return {
          success: false,
          message: '暂停播放失败',
        }
      }
    }
    catch (error) {
      logger.error('暂停播放失败', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : '暂停播放失败',
      }
    }
  }

  /**
   * 恢复播放
   */
  async resume(): Promise<ResumeMusicResult> {
    try {
      if (this.currentState !== 'paused') {
        return {
          success: false,
          message: '当前没有暂停的音乐',
        }
      }

      logger.info('恢复播放')

      const success = await this.sendCommand('resume')

      if (success) {
        return {
          success: true,
          message: '恢复播放指令已发送',
        }
      }
      else {
        return {
          success: false,
          message: '恢复播放失败',
        }
      }
    }
    catch (error) {
      logger.error('恢复播放失败', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : '恢复播放失败',
      }
    }
  }

  /**
   * 停止播放
   */
  async stop(): Promise<StopMusicResult> {
    try {
      if (this.currentState === 'idle' || this.currentState === 'stopped') {
        return {
          success: false,
          message: '当前没有播放中的音乐',
        }
      }

      logger.info('停止播放')

      const success = await this.sendCommand('stop')

      if (success) {
        return {
          success: true,
          message: '停止播放指令已发送',
        }
      }
      else {
        return {
          success: false,
          message: '停止播放失败',
        }
      }
    }
    catch (error) {
      logger.error('停止播放失败', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : '停止播放失败',
      }
    }
  }

  /**
   * 设置音量
   */
  async setVolume(volume: number): Promise<SetVolumeResult> {
    try {
      // 验证音量范围
      if (volume < 0 || volume > 100) {
        return {
          success: false,
          message: `音量值必须在 0-100 之间，当前值: ${volume}`,
        }
      }

      logger.info(`设置音量: ${volume}`)

      const success = await this.sendCommand('setVolume', { volume })

      if (success) {
        this.volume = volume
        return {
          success: true,
          message: `音量已设置为 ${volume}`,
          volume,
        }
      }
      else {
        return {
          success: false,
          message: '设置音量失败',
        }
      }
    }
    catch (error) {
      logger.error('设置音量失败', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : '设置音量失败',
      }
    }
  }

  /**
   * 跳转到指定位置（秒）
   */
  async seek(position: number): Promise<SeekResult> {
    try {
      if (this.currentState === 'idle' || this.currentState === 'stopped') {
        return {
          success: false,
          message: '当前没有播放中的音乐',
        }
      }

      if (position < 0) {
        return {
          success: false,
          message: `位置必须为非负数，当前值: ${position}`,
        }
      }

      logger.info(`跳转到: ${position}秒`)

      const success = await this.sendCommand('seek', { position })

      if (success) {
        return {
          success: true,
          message: `跳转指令已发送到 ${position.toFixed(1)} 秒`,
          position,
        }
      }
      else {
        return {
          success: false,
          message: '跳转失败',
        }
      }
    }
    catch (error) {
      logger.error('跳转失败', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : '跳转失败',
      }
    }
  }

  /**
   * 设置循环播放
   */
  async setLoop(loop: boolean): Promise<SetLoopResult> {
    try {
      logger.info(`设置循环播放: ${loop}`)

      const success = await this.sendCommand('setLoop', { loop })

      if (success) {
        this.loop = loop
        return {
          success: true,
          message: loop ? '已开启循环播放' : '已关闭循环播放',
          loop,
        }
      }
      else {
        return {
          success: false,
          message: '设置循环播放失败',
        }
      }
    }
    catch (error) {
      logger.error('设置循环播放失败', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : '设置循环播放失败',
      }
    }
  }

  /**
   * 设置播放速度
   */
  async setPlaybackRate(rate: number): Promise<SetPlaybackRateResult> {
    try {
      // 验证播放速度范围
      if (rate < 0.5 || rate > 2.0) {
        return {
          success: false,
          message: `播放速度必须在 0.5-2.0 之间，当前值: ${rate}`,
        }
      }

      logger.info(`设置播放速度: ${rate}`)

      const success = await this.sendCommand('setPlaybackRate', { rate })

      if (success) {
        this.playbackRate = rate
        return {
          success: true,
          message: `播放速度已设置为 ${rate}x`,
          rate,
        }
      }
      else {
        return {
          success: false,
          message: '设置播放速度失败',
        }
      }
    }
    catch (error) {
      logger.error('设置播放速度失败', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : '设置播放速度失败',
      }
    }
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
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 10000)

          response = await fetch(searchUrl, {
            headers,
            signal: controller.signal,
          })

          clearTimeout(timeoutId)
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

  /**
   * 解析实际播放 URL（落雪音乐直链 API）
   */
  async resolvePlayUrl(songId: string): Promise<string | null> {
    try {
      const config = this.getMusicConfig()
      const apiUrl = `${config.urlApi}/url/${config.defaultSource}/${songId}/${config.defaultQuality}`

      logger.info(`解析直链: ${apiUrl}`)

      const headers = {
        'X-Request-Key': config.urlApiKey,
        'User-Agent': 'lx-music-request',
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000)

      const response = await fetch(apiUrl, {
        headers,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        logger.error(`直链 API 返回错误: HTTP ${response.status}`)
        return null
      }

      const data = await response.json() as Record<string, unknown>

      // 尝试多种响应格式
      let realUrl: string | null = null
      if (typeof data === 'object' && data !== null) {
        if (typeof data.url === 'string') {
          realUrl = data.url
        }
        else if (data.data) {
          if (typeof data.data === 'object' && data.data !== null) {
            const inner = data.data as Record<string, unknown>
            if (typeof inner.url === 'string') {
              realUrl = inner.url
            }
          }
          else if (typeof data.data === 'string') {
            realUrl = data.data
          }
        }
      }

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
      logger.info(`请求 URL: ${url}`)

      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)

      const response = await fetch(url, {
        headers,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

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
        return {
          success: false,
          message: '该歌曲暂无歌词',
        }
      }

      const lrclist = data.data?.lrclist
      if (!lrclist || lrclist.length === 0) {
        return {
          success: false,
          message: '未找到歌词',
        }
      }

      // 转换为 LRC 格式字符串
      const lrcLines: string[] = []
      for (const item of lrclist) {
        const text = item.lineLyric?.trim()
        if (!text || !item.time) {
          continue
        }

        let timeSec: number
        try {
          timeSec = Number.parseFloat(item.time)
        }
        catch {
          continue
        }

        if (Number.isNaN(timeSec)) {
          continue
        }

        // 转换秒数为 [mm:ss.xx] 格式
        const minutes = Math.floor(timeSec / 60)
        const seconds = timeSec - minutes * 60
        const timeTag = `[${String(minutes).padStart(2, '0')}:${seconds.toFixed(2).padStart(5, '0')}]`
        lrcLines.push(`${timeTag} ${text}`)
      }

      if (lrcLines.length === 0) {
        return {
          success: false,
          message: '未找到歌词',
        }
      }

      const lyrics = lrcLines.join('\n')
      logger.info(`歌词获取成功，共 ${lrcLines.length} 行`)

      return {
        success: true,
        message: '歌词获取成功',
        lyrics,
      }
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
