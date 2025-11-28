/**
 * 音乐播放器服务
 * 管理音乐播放状态，通过 IPC 与渲染进程通信
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
import { ensureBackgroundAudioWindow } from '../../../windows/windowManager'

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

  // 音乐 API 配置
  private readonly MUSIC_API_BASE = 'https://music-dl.sayqz.com/api/'

  private constructor() {
    console.log('[MusicPlayer] 音乐播放器初始化')
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
   * 从 URL 中提取平台信息
   */
  private extractPlatformFromUrl(url: string): string | undefined {
    try {
      const urlObj = new URL(url)
      return urlObj.searchParams.get('source') || undefined
    }
    catch {
      return undefined
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
      console.log(`[MusicPlayer] 播放音乐: ${filePath}, 起始位置: ${startPosition}秒`)
      if (metadata?.name) {
        console.log(`[MusicPlayer] 歌曲信息: ${metadata.name} - ${metadata.artist || '未知歌手'}`)
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
        platform: this.extractPlatformFromUrl(filePath),
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
        this.currentState = 'playing'
        console.log(`[MusicPlayer] 音乐播放成功`)
        return {
          success: true,
          message: '音乐播放成功',
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
      console.error('[MusicPlayer] 播放音乐失败:', error)
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

      console.log('[MusicPlayer] 暂停播放')

      const success = await this.sendCommand('pause')

      if (success) {
        this.currentState = 'paused'
        return {
          success: true,
          message: '已暂停播放',
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
      console.error('[MusicPlayer] 暂停播放失败:', error)
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

      console.log('[MusicPlayer] 恢复播放')

      const success = await this.sendCommand('resume')

      if (success) {
        this.currentState = 'playing'
        return {
          success: true,
          message: '已恢复播放',
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
      console.error('[MusicPlayer] 恢复播放失败:', error)
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

      console.log('[MusicPlayer] 停止播放')

      const success = await this.sendCommand('stop')

      if (success) {
        this.currentState = 'stopped'
        this.currentTime = 0
        return {
          success: true,
          message: '已停止播放',
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
      console.error('[MusicPlayer] 停止播放失败:', error)
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

      console.log(`[MusicPlayer] 设置音量: ${volume}`)

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
      console.error('[MusicPlayer] 设置音量失败:', error)
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

      console.log(`[MusicPlayer] 跳转到: ${position}秒`)

      const success = await this.sendCommand('seek', { position })

      if (success) {
        this.currentTime = position
        return {
          success: true,
          message: `已跳转到 ${position.toFixed(1)} 秒`,
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
      console.error('[MusicPlayer] 跳转失败:', error)
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
      console.log(`[MusicPlayer] 设置循环播放: ${loop}`)

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
      console.error('[MusicPlayer] 设置循环播放失败:', error)
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

      console.log(`[MusicPlayer] 设置播放速度: ${rate}`)

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
      console.error('[MusicPlayer] 设置播放速度失败:', error)
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
      console.error('[MusicPlayer] 获取状态失败:', error)
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
   * 搜索音乐
   */
  async search(keyword: string, platform: MusicPlatform = 'kuwo', limit = 20): Promise<SearchMusicResult> {
    try {
      console.log(`[MusicPlayer] 搜索音乐: ${keyword}, 平台: ${platform}`)

      const params = new URLSearchParams({
        type: 'search',
        source: platform,
        keyword,
        limit: String(limit),
      })

      const url = `${this.MUSIC_API_BASE}?${params.toString()}`
      console.log(`[MusicPlayer] 请求 URL: ${url}`)

      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json() as {
        code: number
        message: string
        data?: {
          keyword: string
          total: number
          results: MusicSearchResult[]
        }
      }

      if (data.code !== 200 || !data.data) {
        return {
          success: false,
          message: data.message || '搜索失败',
        }
      }

      console.log(`[MusicPlayer] 搜索到 ${data.data.total} 首歌曲`)

      return {
        success: true,
        message: `找到 ${data.data.total} 首歌曲`,
        keyword: data.data.keyword,
        total: data.data.total,
        results: data.data.results,
      }
    }
    catch (error) {
      console.error('[MusicPlayer] 搜索音乐失败:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : '搜索音乐失败',
      }
    }
  }

  /**
   * 获取歌词
   */
  async getLyrics(songId: string, platform: MusicPlatform = 'kuwo'): Promise<GetLyricsResult> {
    try {
      console.log(`[MusicPlayer] 获取歌词: ID=${songId}, 平台=${platform}`)

      const params = new URLSearchParams({
        type: 'lrc',
        source: platform,
        id: songId,
      })

      const url = `${this.MUSIC_API_BASE}?${params.toString()}`
      console.log(`[MusicPlayer] 请求 URL: ${url}`)

      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const lyrics = await response.text()

      if (!lyrics || lyrics.trim().length === 0) {
        return {
          success: false,
          message: '未找到歌词',
        }
      }

      console.log(`[MusicPlayer] 歌词获取成功`)

      return {
        success: true,
        message: '歌词获取成功',
        lyrics,
      }
    }
    catch (error) {
      console.error('[MusicPlayer] 获取歌词失败:', error)
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
        console.error('[MusicPlayer] webContents 不可用')
        return false
      }

      // 等待页面加载完成
      if (audioWindow.webContents.isLoading()) {
        console.log('[MusicPlayer] 等待后台音频窗口加载完成...')
        await new Promise<void>((resolve) => {
          audioWindow.webContents.once('did-finish-load', () => {
            console.log('[MusicPlayer] 后台音频窗口加载完成')
            resolve()
          })
        })
      }

      const message = { command, args }
      console.log('[MusicPlayer] 发送 IPC 消息到后台音频窗口:', message)
      audioWindow.webContents.send('music:command', message)

      return true
    }
    catch (error) {
      console.error('[MusicPlayer] 发送指令失败:', error)
      return false
    }
  }
}
