import type { BrowserWindow } from 'electron'
import type { Buffer } from 'node:buffer'
import type { DeviceState } from '../constants/DeviceState'
import type { Protocol } from '../protocols/Protocol'
import type { Application } from '../services/Application'
import type { AudioListener } from '../types/audio'
import type { UIPlugin } from './UIPlugin'
import { ipcMain } from 'electron'
import { getOpusCodec, initOpusCodec } from '../ipc/audioIpc'
import { Plugin } from './Plugin'

/**
 * 音频性能指标
 */
interface AudioMetrics {
  /** 总接收帧数（来自渲染进程） */
  totalFrames: number
  /** 已编码帧数（实际进行 Opus 编码的） */
  encodedFrames: number
  /** 丢弃帧数（背压控制） */
  droppedFrames: number
  /** 累计编码时间（ms） */
  totalEncodeTime: number
  /** 累计发送时间（ms） */
  totalSendTime: number
  /** 最后一次指标重置时间 */
  lastResetTime: number
}

/**
 * 音频插件
 * 负责音频采集、编码、发送和接收、解码、播放
 *
 * 职责：
 * - 初始化 OpusCodec
 * - 监听渲染进程的 PCM 数据（IPC）
 * - 编码 PCM → Opus，发送到协议层
 * - 接收协议层的 Opus 数据
 * - 解码 Opus → PCM，发送到渲染进程（IPC）
 * - 控制后台音频窗口采集
 */
export class AudioPlugin extends Plugin {
  readonly name = 'AudioPlugin'
  readonly priority = 10 // 优先级最高

  readonly metadata = {
    name: 'AudioPlugin',
    version: '1.1.0',
    description: '音频处理插件，负责音频采集、编码、传输和播放',
    author: 'Junsen',
  }

  private protocol: Protocol | null = null
  private backgroundAudioWindow: BrowserWindow | null = null

  // 音频监听器（观察者模式）
  private audioListeners: Set<AudioListener> = new Set()

  // ========== 背压控制 ==========
  /** 最大允许的 WebSocket 缓冲区大小（字节） */
  private readonly MAX_BUFFER_SIZE = 64 * 1024 // 64KB
  /** 连续丢帧计数（用于日志节流） */
  private consecutiveDrops = 0
  /** 丢帧日志节流阈值 */
  private readonly DROP_LOG_THRESHOLD = 50 // 每 50 帧打印一次

  // ========== 性能指标 ==========
  private metrics: AudioMetrics = {
    totalFrames: 0,
    encodedFrames: 0,
    droppedFrames: 0,
    totalEncodeTime: 0,
    totalSendTime: 0,
    lastResetTime: Date.now(),
  }

  /** 指标打印间隔（帧数） */
  private readonly METRICS_LOG_INTERVAL = 500 // 每 500 帧（约 10 秒）打印一次

  /**
   * 插件初始化
   */
  async setup(app: Application): Promise<void> {
    // 调用父类 setup
    await super.setup(app)

    console.log('[AudioPlugin] 初始化...')

    try {
      // 初始化 OpusCodec
      initOpusCodec()
      console.log('[AudioPlugin] ✓ OpusCodec 已初始化')

      // 监听来自后台音频窗口的 PCM 数据
      ipcMain.on('audio:pcm', (_event, pcmData: Int16Array) => {
        this.handlePCMFromRenderer(pcmData)
      })

      console.log('[AudioPlugin] ✓ 初始化完成')
    }
    catch (error) {
      console.error('[AudioPlugin] ✗ 初始化失败:', error)
      throw error
    }
  }

  /**
   * 插件启动
   */
  async start(): Promise<void> {
    // 调用父类 start
    await super.start()

    console.log('[AudioPlugin] ✓ 启动完成')
  }

  /**
   * 协议连接成功回调
   */
  async onProtocolConnected(protocol: Protocol): Promise<void> {
    console.log('[AudioPlugin] 协议已连接')
    this.protocol = protocol
  }

  /**
   * 音频通道打开回调
   */
  async onAudioChannelOpened(): Promise<void> {
    console.log('[AudioPlugin] 音频通道已打开')

    // 通知 UIPlugin 广播状态更新（确保 channelOpen 状态同步）
    if (this.app) {
      const currentState = this.app.getDeviceState()
      this.getUIPlugin()?.broadcastState(currentState)
    }
  }

  /**
   * 音频通道关闭回调
   */
  async onAudioChannelClosed(): Promise<void> {
    console.log('[AudioPlugin] 音频通道已关闭')

    // 通知 UIPlugin 广播状态更新（即使设备状态没变，channelOpen 已经变化）
    if (this.app) {
      const currentState = this.app.getDeviceState()
      this.getUIPlugin()?.broadcastState(currentState)
    }
  }

  /**
   * 接收到音频数据回调
   */
  async onIncomingAudio(data: Buffer): Promise<void> {
    // 解码并发送到渲染进程播放
    this.handleOpusFromNetwork(data)
  }

  /**
   * 设备状态变化回调
   * 控制后台音频窗口的采集行为
   */
  async onDeviceStateChanged(state: DeviceState): Promise<void> {
    console.log(`[AudioPlugin] 设备状态变化: ${state}`)

    // 根据状态控制后台音频窗口
    if (this.backgroundAudioWindow && !this.backgroundAudioWindow.isDestroyed()) {
      if (state === 'listening') {
        // 开始监听前，先切换设备（如果配置有变化）
        console.log('[AudioPlugin] 通知后台音频窗口检查设备配置')
        this.backgroundAudioWindow.webContents.send('audio:command', 'switchDevices')

        // 等待设备切换完成后再启动采集
        await new Promise(resolve => setTimeout(resolve, 100))

        // 启动音频采集
        console.log('[AudioPlugin] 通知后台音频窗口启动采集')
        this.backgroundAudioWindow.webContents.send('audio:command', 'start')
      }
    }
  }

  /**
   * 获取 UIPlugin 实例
   */
  private getUIPlugin(): UIPlugin | undefined {
    return this.app?.getPluginManager().getPlugin<UIPlugin>('ui')
  }

  /**
   * 设置后台音频窗口引用
   */
  setBackgroundAudioWindow(window: BrowserWindow): void {
    this.backgroundAudioWindow = window
  }

  /**
   * 添加音频监听器
   */
  addAudioListener(listener: AudioListener): void {
    this.audioListeners.add(listener)
    console.log(`[AudioPlugin] 添加音频监听器: ${listener.name}`)
  }

  /**
   * 移除音频监听器
   */
  removeAudioListener(listener: AudioListener): void {
    this.audioListeners.delete(listener)
    console.log(`[AudioPlugin] 移除音频监听器: ${listener.name}`)
  }

  /**
   * 广播音频数据到所有监听器（异步，避免阻塞主流程）
   */
  private notifyAudioListeners(pcmData: Int16Array): void {
    if (this.audioListeners.size === 0) {
      return
    }

    // 使用 setImmediate 异步执行，避免阻塞音频发送
    setImmediate(() => {
      for (const listener of this.audioListeners) {
        try {
          listener.onAudioData(pcmData)
        }
        catch (error) {
          console.error(`[AudioPlugin] 监听器 ${listener.name} 处理失败:`, error)
        }
      }
    })
  }

  /**
   * 获取后台音频窗口引用
   */
  getBackgroundAudioWindow(): BrowserWindow | null {
    return this.backgroundAudioWindow
  }

  /**
   * 检查是否应该丢弃帧（背压控制）
   * @returns true 如果应该丢弃当前帧
   */
  private shouldDropFrame(): boolean {
    // 获取 WebSocket 实例检查缓冲区
    const ws = (this.protocol as any)?.ws
    if (!ws) {
      return false
    }

    // 检查 WebSocket 缓冲区大小
    const bufferedAmount = ws.bufferedAmount || 0
    if (bufferedAmount > this.MAX_BUFFER_SIZE) {
      this.consecutiveDrops++
      this.metrics.droppedFrames++

      // 节流日志：每 DROP_LOG_THRESHOLD 帧打印一次
      if (this.consecutiveDrops % this.DROP_LOG_THRESHOLD === 1) {
        console.warn(
          `[AudioPlugin] 网络拥塞，丢弃帧 (buffered: ${(bufferedAmount / 1024).toFixed(1)}KB, 连续丢弃: ${this.consecutiveDrops})`,
        )
      }
      return true
    }

    // 缓冲区恢复正常，重置计数
    if (this.consecutiveDrops > 0) {
      console.log(`[AudioPlugin] 网络恢复，共丢弃 ${this.consecutiveDrops} 帧`)
      this.consecutiveDrops = 0
    }
    return false
  }

  /**
   * 打印性能指标（节流）
   */
  private logMetricsIfNeeded(): void {
    if (this.metrics.totalFrames % this.METRICS_LOG_INTERVAL !== 0) {
      return
    }

    const elapsed = (Date.now() - this.metrics.lastResetTime) / 1000

    // 平均编码时间：只计算实际编码的帧
    const avgEncodeTime = this.metrics.encodedFrames > 0
      ? (this.metrics.totalEncodeTime / this.metrics.encodedFrames).toFixed(2)
      : '-'

    // 丢帧率：相对于已编码帧
    const dropRate = this.metrics.encodedFrames > 0
      ? ((this.metrics.droppedFrames / (this.metrics.encodedFrames + this.metrics.droppedFrames)) * 100).toFixed(1)
      : '0.0'

    // 编码率：编码帧占总帧的比例
    const encodeRate = this.metrics.totalFrames > 0
      ? ((this.metrics.encodedFrames / this.metrics.totalFrames) * 100).toFixed(1)
      : '0.0'

    console.log(
      `[AudioPlugin] 性能指标: 总帧=${this.metrics.totalFrames}, `
      + `编码=${this.metrics.encodedFrames}(${encodeRate}%), `
      + `平均编码=${avgEncodeTime}ms, 丢帧=${this.metrics.droppedFrames}(${dropRate}%), `
      + `耗时=${elapsed.toFixed(1)}s`,
    )
  }

  /**
   * 重置性能指标
   */
  resetMetrics(): void {
    this.metrics = {
      totalFrames: 0,
      encodedFrames: 0,
      droppedFrames: 0,
      totalEncodeTime: 0,
      totalSendTime: 0,
      lastResetTime: Date.now(),
    }
    this.consecutiveDrops = 0
  }

  /**
   * 获取当前性能指标快照
   */
  getMetrics(): Readonly<AudioMetrics> {
    return { ...this.metrics }
  }

  /**
   * 处理来自渲染进程的 PCM 数据
   */
  private handlePCMFromRenderer(pcmData: Int16Array): void {
    this.metrics.totalFrames++

    try {
      // 1. 发送到服务器（仅在应该采集时）
      if (this.app?.shouldCaptureAudio()) {
        // 背压控制：检查是否应该丢弃帧
        if (this.shouldDropFrame()) {
          // 丢弃帧，但仍然通知监听器（唤醒词检测等）
          this.notifyAudioListeners(pcmData)
          return
        }

        const opusCodec = getOpusCodec()
        if (!opusCodec) {
          console.error('[AudioPlugin] OpusCodec 未初始化')
          return
        }

        // 编码 PCM → Opus（记录耗时）
        const encodeStart = performance.now()
        const opusFrame = opusCodec.encode(pcmData)
        this.metrics.totalEncodeTime += performance.now() - encodeStart
        this.metrics.encodedFrames++

        // 发送到 WebSocket 服务器
        if (this.protocol && this.protocol.isAudioChannelOpened()) {
          const sendStart = performance.now()
          this.protocol.sendAudio(opusFrame).catch((error) => {
            console.error('[AudioPlugin] 发送音频失败:', error)
          })
          this.metrics.totalSendTime += performance.now() - sendStart
        }
      }
    }
    catch (error) {
      console.error('[AudioPlugin] 处理 PCM 数据失败:', error)
    }
    finally {
      // 2. 通知音频监听器（始终执行，即使不发送到服务器）
      this.notifyAudioListeners(pcmData)

      // 3. 定期打印性能指标
      this.logMetricsIfNeeded()
    }
  }

  /**
   * 处理从网络接收的 Opus 数据
   */
  private handleOpusFromNetwork(opusFrame: Buffer): void {
    try {
      const opusCodec = getOpusCodec()
      if (!opusCodec) {
        console.error('[AudioPlugin] OpusCodec 未初始化')
        return
      }

      // 解码 Opus → PCM
      const pcmBuffer = opusCodec.decode(opusFrame)

      // 发送到后台音频窗口播放
      if (this.backgroundAudioWindow) {
        this.backgroundAudioWindow.webContents.send('audio:opus-decoded', pcmBuffer)
      }
      else {
        console.warn('[AudioPlugin] 后台音频窗口不存在，无法播放音频')
      }
    }
    catch (error) {
      console.error('[AudioPlugin] 处理 Opus 数据失败:', error)
    }
  }

  /**
   * 插件停止
   */
  async stop(): Promise<void> {
    // 调用父类 stop
    await super.stop()

    console.log('[AudioPlugin] ✓ 已停止')
  }

  /**
   * 插件关闭
   */
  async shutdown(): Promise<void> {
    console.log('[AudioPlugin] 正在关闭...')

    // 打印最终性能报告
    if (this.metrics.totalFrames > 0) {
      const elapsed = (Date.now() - this.metrics.lastResetTime) / 1000
      const avgEncodeTime = this.metrics.encodedFrames > 0
        ? (this.metrics.totalEncodeTime / this.metrics.encodedFrames).toFixed(2)
        : '-'
      const encodeRate = ((this.metrics.encodedFrames / this.metrics.totalFrames) * 100).toFixed(1)
      const dropRate = this.metrics.encodedFrames > 0
        ? ((this.metrics.droppedFrames / (this.metrics.encodedFrames + this.metrics.droppedFrames)) * 100).toFixed(1)
        : '0.0'

      console.log('[AudioPlugin] ========== 最终性能报告 ==========')
      console.log(`[AudioPlugin] 总接收帧数: ${this.metrics.totalFrames}`)
      console.log(`[AudioPlugin] 编码帧数: ${this.metrics.encodedFrames} (${encodeRate}%)`)
      console.log(`[AudioPlugin] 丢弃帧数: ${this.metrics.droppedFrames} (${dropRate}%)`)
      console.log(`[AudioPlugin] 平均编码时间: ${avgEncodeTime}ms`)
      console.log(`[AudioPlugin] 运行时长: ${elapsed.toFixed(1)}s`)
      console.log('[AudioPlugin] =====================================')
    }

    // 停止后台音频窗口的采集
    if (this.backgroundAudioWindow && !this.backgroundAudioWindow.isDestroyed()) {
      console.log('[AudioPlugin] 通知后台音频窗口停止采集并清理资源')
      this.backgroundAudioWindow.webContents.send('audio:command', 'cleanup')
    }

    // 清理 IPC 监听器
    ipcMain.removeAllListeners('audio:pcm')

    // 清理引用
    this.protocol = null
    this.backgroundAudioWindow = null

    // 重置指标
    this.resetMetrics()

    // 调用父类 shutdown
    await super.shutdown()

    console.log('[AudioPlugin] ✓ 已关闭')
  }
}
