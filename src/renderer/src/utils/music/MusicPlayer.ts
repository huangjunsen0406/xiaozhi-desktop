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
    // 播放开始
    this.audio.addEventListener('play', () => {
      console.log('开始播放')
      this.notifyMainProcess({ state: 'playing' })
    })

    // 播放暂停
    this.audio.addEventListener('pause', () => {
      console.log('已暂停')
      this.notifyMainProcess({ state: 'paused' })
    })

    // 播放结束
    this.audio.addEventListener('ended', () => {
      console.log('播放结束')
      this.notifyMainProcess({
        state: 'stopped',
        currentTime: 0,
      })
    })

    // 加载元数据
    this.audio.addEventListener('loadedmetadata', () => {
      console.log(`[MusicPlayer] 元数据加载完成，时长: ${this.audio.duration}秒`)
      this.notifyMainProcess({
        duration: this.audio.duration,
      })
    })

    // 播放进度更新
    this.audio.addEventListener('timeupdate', () => {
      this.notifyMainProcess({
        currentTime: this.audio.currentTime,
      })
    })

    // 加载错误
    this.audio.addEventListener('error', (event) => {
      const error = this.audio.error
      const errorMessage = error
        ? `加载失败: ${error.message} (code: ${error.code})`
        : '未知错误'

      console.error('播放错误', errorMessage, event)
      this.notifyMainProcess({
        state: 'error',
        error: errorMessage,
      })
    })

    // 加载开始
    this.audio.addEventListener('loadstart', () => {
      console.log('开始加载音乐')
      this.notifyMainProcess({ state: 'loading' })
    })

    // 可以播放
    this.audio.addEventListener('canplay', () => {
      console.log('音乐已就绪')
    })
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
        return
      }

      const { filePath, startPosition, volume, loop, playbackRate } = args

      console.log(`[MusicPlayer] 播放: ${filePath}`)

      // 设置音频源（支持 URL 和本地文件路径）
      if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
        this.audio.src = filePath
      }
      else {
        this.audio.src = `file://${filePath}`
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
      this.audio.play().catch((error) => {
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
