/**
 * 音乐播放器（渲染进程）
 * 使用 HTML5 Audio API 播放音乐
 */

export type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'stopped' | 'error'

export interface MusicCommand {
  command: string
  args?: Record<string, unknown>
}

/**
 * 音乐播放器类
 */
export class MusicPlayer {
  private audio: HTMLAudioElement
  private currentState: PlaybackState = 'idle'
  private lastTimeUpdateNotify = 0

  // 保存事件处理函数引用，以便 dispose 时移除
  private readonly onPlay = () => {
    console.log('开始播放')
    this.currentState = 'playing'
    this.notifyMainProcess({ state: 'playing' })
  }

  private readonly onPause = () => {
    console.log('已暂停')
    this.currentState = 'paused'
    this.notifyMainProcess({ state: 'paused' })
  }

  private readonly onEnded = () => {
    console.log('播放结束')
    this.currentState = 'stopped'
    this.notifyMainProcess({ state: 'stopped', currentTime: 0 })
  }

  private readonly onLoadedMetadata = () => {
    console.log(`[MusicPlayer] 元数据加载完成，时长: ${this.audio.duration}秒`)
    this.notifyMainProcess({ duration: this.audio.duration })
  }

  private readonly onTimeUpdate = () => {
    // 节流：至少间隔 500ms 才发送 IPC 通知
    const now = Date.now()
    if (now - this.lastTimeUpdateNotify < 500)
      return
    this.lastTimeUpdateNotify = now
    this.notifyMainProcess({ currentTime: this.audio.currentTime })
  }

  private readonly onError = (event: Event) => {
    const error = this.audio.error
    const errorMessage = error
      ? `加载失败: ${error.message} (code: ${error.code})`
      : '未知错误'
    console.error('播放错误', errorMessage, event)
    this.currentState = 'error'
    this.notifyMainProcess({ state: 'error', error: errorMessage })
  }

  private readonly onLoadStart = () => {
    console.log('开始加载音乐')
    if (this.currentState !== 'playing') {
      this.currentState = 'loading'
      this.notifyMainProcess({ state: 'loading' })
    }
  }

  private readonly onCanPlay = () => {
    console.log('音乐已就绪')
  }

  constructor() {
    console.log('初始化渲染进程音乐播放器')

    // 创建 Audio 元素
    this.audio = new Audio()

    // 注册事件监听器
    this.setupEventListeners()

    // 监听主进程指令
    this.listenToMainProcess()
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    this.audio.addEventListener('play', this.onPlay)
    this.audio.addEventListener('pause', this.onPause)
    this.audio.addEventListener('ended', this.onEnded)
    this.audio.addEventListener('loadedmetadata', this.onLoadedMetadata)
    this.audio.addEventListener('timeupdate', this.onTimeUpdate)
    this.audio.addEventListener('error', this.onError)
    this.audio.addEventListener('loadstart', this.onLoadStart)
    this.audio.addEventListener('canplay', this.onCanPlay)
  }

  /**
   * 监听主进程的指令
   */
  private listenToMainProcess(): void {
    console.log('开始注册 IPC 监听器')
    window.api.musicOnCommand((message: MusicCommand) => {
      const { command, args } = message

      console.log(`[MusicPlayer] 收到指令: ${command}`, args)

      switch (command) {
        case 'play':
          this.play(args)
          break

        case 'pause':
          this.pause()
          break

        case 'resume':
          this.resume()
          break

        case 'stop':
          this.stop()
          break

        case 'setVolume':
          if (args && typeof args.volume === 'number') {
            this.setVolume(args.volume)
          }
          break

        case 'seek':
          if (args && typeof args.position === 'number') {
            this.seek(args.position)
          }
          break

        case 'setLoop':
          if (args && typeof args.loop === 'boolean') {
            this.setLoop(args.loop)
          }
          break

        case 'setPlaybackRate':
          if (args && typeof args.rate === 'number') {
            this.setPlaybackRate(args.rate)
          }
          break

        default:
          console.warn(`[MusicPlayer] 未知指令: ${command}`)
      }
    })

    console.log('已注册主进程指令监听器')
  }

  /**
   * 播放音乐
   */
  private play(args?: Record<string, unknown>): void {
    try {
      if (!args || typeof args.filePath !== 'string') {
        console.error('[MusicPlayer] 缺少文件路径')
        this.currentState = 'error'
        this.notifyMainProcess({ state: 'error', error: '缺少文件路径' })
        return
      }

      const { filePath, startPosition, volume, loop, playbackRate } = args

      console.log(`[MusicPlayer] 播放: ${filePath}`)
      this.currentState = 'loading'
      this.notifyMainProcess({ state: 'loading', message: `准备播放: ${filePath}` })

      // 设置音频源（支持 URL 和本地文件路径）
      if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
        this.audio.src = filePath
        console.log(`[MusicPlayer] 设置在线音源: ${filePath}`)
        this.notifyMainProcess({ message: `设置在线音源: ${filePath}` })
      }
      else {
        // Windows 路径: D:\path\to\file.mp3 -> file:///D:/path/to/file.mp3
        // macOS/Linux: /path/to/file.mp3 -> file:///path/to/file.mp3
        const normalizedPath = filePath.replace(/\\/g, '/')
        const fileUrl = normalizedPath.startsWith('/')
          ? `file://${normalizedPath}`
          : `file:///${normalizedPath}`
        this.audio.src = fileUrl
        console.log(`[MusicPlayer] 设置本地文件: ${filePath} -> ${fileUrl}`)
        this.notifyMainProcess({ message: `设置本地文件: ${fileUrl}` })
      }

      // 应用配置
      if (typeof startPosition === 'number') {
        this.audio.currentTime = startPosition
      }

      if (typeof volume === 'number') {
        this.audio.volume = volume / 100 // 0-100 → 0-1
      }

      if (typeof loop === 'boolean') {
        this.audio.loop = loop
      }

      if (typeof playbackRate === 'number') {
        this.audio.playbackRate = playbackRate
      }

      // 播放
      console.log('[MusicPlayer] 调用 audio.play()')
      this.notifyMainProcess({ message: '开始调用 audio.play()' })
      this.audio.play()
        .then(() => {
          console.log('[MusicPlayer] audio.play() 成功')
          this.notifyMainProcess({ message: 'audio.play() 调用成功' })
        })
        .catch((error) => {
          console.error('播放失败', error)
          this.notifyMainProcess({
            state: 'error',
            error: error instanceof Error ? error.message : '播放失败',
          })
        })
    }
    catch (error) {
      console.error('播放异常', error)
      this.notifyMainProcess({
        state: 'error',
        error: error instanceof Error ? error.message : '播放异常',
      })
    }
  }

  /**
   * 暂停播放
   */
  private pause(): void {
    try {
      this.audio.pause()
    }
    catch (error) {
      console.error('暂停失败', error)
    }
  }

  /**
   * 恢复播放
   */
  private resume(): void {
    try {
      this.audio.play().catch((error) => {
        console.error('恢复播放失败', error)
      })
    }
    catch (error) {
      console.error('恢复播放异常', error)
    }
  }

  /**
   * 停止播放
   */
  private stop(): void {
    try {
      this.audio.pause()
      this.audio.currentTime = 0
      this.currentState = 'stopped'
      this.notifyMainProcess({
        state: 'stopped',
        currentTime: 0,
      })
    }
    catch (error) {
      console.error('停止失败', error)
    }
  }

  /**
   * 设置音量
   */
  private setVolume(volume: number): void {
    try {
      // 音量范围 0-100，转换为 0-1
      this.audio.volume = Math.max(0, Math.min(100, volume)) / 100
      console.log(`[MusicPlayer] 音量设置为: ${volume}`)
    }
    catch (error) {
      console.error('设置音量失败', error)
    }
  }

  /**
   * 跳转到指定位置
   */
  private seek(position: number): void {
    try {
      this.audio.currentTime = position
      console.log(`[MusicPlayer] 跳转到: ${position}秒`)
    }
    catch (error) {
      console.error('跳转失败', error)
    }
  }

  /**
   * 设置循环播放
   */
  private setLoop(loop: boolean): void {
    try {
      this.audio.loop = loop
      console.log(`[MusicPlayer] 循环播放: ${loop}`)
    }
    catch (error) {
      console.error('设置循环失败', error)
    }
  }

  /**
   * 设置播放速度
   */
  private setPlaybackRate(rate: number): void {
    try {
      this.audio.playbackRate = rate
      console.log(`[MusicPlayer] 播放速度: ${rate}x`)
    }
    catch (error) {
      console.error('设置播放速度失败', error)
    }
  }

  /**
   * 通知主进程状态变化
   */
  private notifyMainProcess(status: Record<string, unknown>): void {
    try {
      window.api.musicStatusUpdate(status)
    }
    catch (error) {
      console.error('通知主进程失败', error)
    }
  }

  /**
   * 清理资源
   */
  dispose(): void {
    console.log('清理资源')
    this.audio.pause()
    this.audio.src = ''
    // 移除所有事件监听器
    this.audio.removeEventListener('play', this.onPlay)
    this.audio.removeEventListener('pause', this.onPause)
    this.audio.removeEventListener('ended', this.onEnded)
    this.audio.removeEventListener('loadedmetadata', this.onLoadedMetadata)
    this.audio.removeEventListener('timeupdate', this.onTimeUpdate)
    this.audio.removeEventListener('error', this.onError)
    this.audio.removeEventListener('loadstart', this.onLoadStart)
    this.audio.removeEventListener('canplay', this.onCanPlay)
    this.audio.remove()
  }
}

// 全局单例
let musicPlayerInstance: MusicPlayer | null = null

/**
 * 获取音乐播放器实例
 */
export function getMusicPlayer(): MusicPlayer {
  if (!musicPlayerInstance) {
    musicPlayerInstance = new MusicPlayer()
  }
  return musicPlayerInstance
}

/**
 * 初始化音乐播放器（在应用启动时调用）
 */
export function initMusicPlayer(): void {
  console.log('初始化全局音乐播放器')
  getMusicPlayer()
}
