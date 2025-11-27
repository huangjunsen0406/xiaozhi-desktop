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
    version: '1.0.0',
    description: '音频处理插件，负责音频采集、编码、传输和播放',
    author: 'Junsen',
  }

  private protocol: Protocol | null = null
  private backgroundAudioWindow: BrowserWindow | null = null

  // 音频监听器（观察者模式）
  private audioListeners: Set<AudioListener> = new Set()

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
   * 广播音频数据到所有监听器
   */
  private notifyAudioListeners(pcmData: Int16Array): void {
    if (this.audioListeners.size === 0) {
      return
    }

    for (const listener of this.audioListeners) {
      try {
        listener.onAudioData(pcmData)
      }
      catch (error) {
        console.error(`[AudioPlugin] 监听器 ${listener.name} 处理失败:`, error)
      }
    }
  }

  /**
   * 获取后台音频窗口引用
   */
  getBackgroundAudioWindow(): BrowserWindow | null {
    return this.backgroundAudioWindow
  }

  /**
   * 处理来自渲染进程的 PCM 数据
   */
  private handlePCMFromRenderer(pcmData: Int16Array): void {
    try {
      // 1. 发送到服务器（仅在应该采集时）
      if (this.app?.shouldCaptureAudio()) {
        const opusCodec = getOpusCodec()
        if (!opusCodec) {
          console.error('[AudioPlugin] OpusCodec 未初始化')
          return
        }

        // 编码 PCM → Opus
        const opusFrame = opusCodec.encode(pcmData)

        // 发送到 WebSocket 服务器
        if (this.protocol && this.protocol.isAudioChannelOpened()) {
          this.protocol.sendAudio(opusFrame).catch((error) => {
            console.error('[AudioPlugin] 发送音频失败:', error)
          })
        }
      }
    }
    catch (error) {
      console.error('[AudioPlugin] 处理 PCM 数据失败:', error)
    }
    finally {
      // 2. 通知音频监听器（始终执行，即使不发送到服务器）
      this.notifyAudioListeners(pcmData)
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

    // 调用父类 shutdown
    await super.shutdown()

    console.log('[AudioPlugin] ✓ 已关闭')
  }
}
