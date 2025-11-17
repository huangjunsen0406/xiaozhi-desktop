import type { BrowserWindow } from 'electron'
import type { Buffer } from 'node:buffer'
import type { DeviceState } from '../constants/DeviceState'
import type { Protocol } from '../protocols/Protocol'
import type { Application } from '../services/Application'
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
 * - 同步设备状态到渲染进程
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
  private mainWindow: BrowserWindow | null = null

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

      // 监听来自渲染进程的 PCM 数据
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
  }

  /**
   * 音频通道关闭回调
   */
  async onAudioChannelClosed(): Promise<void> {
    console.log('[AudioPlugin] 音频通道已关闭')
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
   */
  async onDeviceStateChanged(state: DeviceState): Promise<void> {
    console.log(`[AudioPlugin] 设备状态变化: ${state}`)

    // 通知渲染进程状态变化
    if (this.mainWindow) {
      this.mainWindow.webContents.send('app:state-changed', {
        deviceState: state,
        channelOpen: this.protocol?.isAudioChannelOpened() || false,
      })
    }
  }

  /**
   * 设置主窗口引用
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }

  /**
   * 处理来自渲染进程的 PCM 数据
   */
  private handlePCMFromRenderer(pcmData: Int16Array): void {
    try {
      // 检查是否应该采集音频
      if (!this.app || !this.app.isListening()) {
        return
      }

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
    catch (error) {
      console.error('[AudioPlugin] 处理 PCM 数据失败:', error)
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

      // 发送到渲染进程播放
      if (this.mainWindow) {
        this.mainWindow.webContents.send('audio:opus-decoded', pcmBuffer)
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

    // 清理 IPC 监听器
    ipcMain.removeAllListeners('audio:pcm')

    // 清理引用
    this.protocol = null
    this.mainWindow = null

    // 调用父类 shutdown
    await super.shutdown()

    console.log('[AudioPlugin] ✓ 已关闭')
  }
}
