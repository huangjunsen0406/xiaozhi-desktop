import type { AudioListener, DeviceState } from '@shared/types'
import type { BrowserWindow } from 'electron'
import type { Buffer } from 'node:buffer'
import type { PluginCommands, PluginContext } from '../core'
import { ipcMain } from 'electron'
import { disposeOpusCodec, getOpusCodec, initOpusCodec } from '../audio/codecService'
import { Events } from '../core'
import { getLogger } from '../utils/logger'

import { Plugin } from './Plugin'

const logger = getLogger('AudioPlugin')

/**
 * 音频插件
 * 负责音频采集、编码、发送和接收、解码、播放
 *
 * 职责：
 * - 初始化 OpusCodec
 * - 监听渲染进程的 PCM 数据（IPC）
 * - 编码 PCM -> Opus，通过 cmd.sendAudio 发送到协议层
 * - 接收协议层的 Opus 数据
 * - 解码 Opus -> PCM，发送到渲染进程（IPC）
 * - 控制后台音频窗口采集
 *
 * 不直接持有 protocol 引用，通过 PluginCommands 接口操作协议。
 */
export class AudioPlugin extends Plugin {
  readonly name = 'AudioPlugin'
  readonly priority = 10 // 优先级最高

  static readonly dependencies: string[] = []

  readonly metadata = {
    name: 'AudioPlugin',
    version: '1.1.0',
    description: '音频处理插件，负责音频采集、编码、传输和播放',
    author: 'Junsen',
  }

  private backgroundAudioWindow: BrowserWindow | null = null

  // 音���监听器（观察者模式）
  private audioListeners: Set<AudioListener> = new Set()

  // IPC 监听器引用（用于精确移除）
  private pcmHandler: ((_event: Electron.IpcMainEvent, pcmData: Int16Array) => void) | null = null

  /**
   * 插件初始化
   */
  async setup(ctx: PluginContext, cmd: PluginCommands): Promise<void> {
    await super.setup(ctx, cmd)

    logger.info('初始化...')

    try {
      // 初始化 OpusCodec
      initOpusCodec()
      logger.info('OpusCodec 已初始化')

      // 监听来自后台音频窗口的 PCM 数据（保存引用以便精确移除）
      this.pcmHandler = (_event, pcmData: Int16Array) => {
        this.handlePCMFromRenderer(pcmData)
      }
      ipcMain.on('audio:pcm', this.pcmHandler)

      // 订阅音频接收事件（EventBus fallback；生产路径由 protocol.setAudioHandler 直连）
      ctx.eventBus.on(Events.INCOMING_AUDIO, (data) => {
        this.onIncomingAudio(data)
      })

      // 订阅设备状态变更事件
      ctx.eventBus.on(Events.DEVICE_STATE_CHANGED, (data) => {
        const { newState } = data
        this.onDeviceStateChanged(newState)
      })

      logger.info('初始化完成')
    }
    catch (error) {
      logger.error('初始化失败', error)
      throw error
    }
  }

  /**
   * 插件启动
   */
  async start(): Promise<void> {
    await super.start()
    logger.info('启动完成')
  }

  /**
   * 设备状态变化处理
   * 在进入监听状态时检查并切换音频设备
   */
  private onDeviceStateChanged(state: DeviceState): void {
    logger.info(`设备状态变化: ${state}`)

    // 根据状态控制后台音频窗口
    if (this.backgroundAudioWindow && !this.backgroundAudioWindow.isDestroyed()) {
      if (state === 'listening') {
        // 开始监听前，检查并切换设备（如果配置有变化）
        logger.info('通知后台音频窗口检查设备配置')
        this.backgroundAudioWindow.webContents.send('audio:command', 'switchDevices')
      }
    }
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
    logger.info(`添加音频监听器: ${listener.name}`)
  }

  /**
   * 移除音频监听器
   */
  removeAudioListener(listener: AudioListener): void {
    this.audioListeners.delete(listener)
    logger.info(`移除音频监听器: ${listener.name}`)
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
          logger.error(`监听器 ${listener.name} 处理失败:`, error)
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
   * 处理来自渲染进程的 PCM 数据
   */
  private handlePCMFromRenderer(pcmData: Int16Array): void {
    try {
      // 1. 发送到服务器（仅在应该采集时）
      if (this.ctx?.shouldCaptureAudio()) {
        const opusCodec = getOpusCodec()
        if (!opusCodec) {
          logger.error('OpusCodec 未初始化')
          return
        }

        // 编码 PCM -> Opus
        const opusFrame = opusCodec.encode(pcmData)

        // 通过 PluginCommands 发送音频
        if (this.ctx.isAudioChannelOpened()) {
          this.cmd?.sendAudio(opusFrame).catch((error) => {
            logger.error('发送音频失败', error)
          })
        }
      }
    }
    catch (error) {
      logger.error('处理 PCM 数据失败', error)
    }
    finally {
      // 2. 通知音频监听器（始终执行，即使不发送到服务器）
      this.notifyAudioListeners(pcmData)
    }
  }

  /**
   * 入站 Opus 音频入口（直连 handler / EventBus fallback 共用）
   *
   * 由 ProtocolManager.setAudioHandler 直连调用，或 EventBus INCOMING_AUDIO 触发。
   */
  onIncomingAudio(opusFrame: Buffer): void {
    this.handleOpusFromNetwork(opusFrame)
  }

  /**
   * 处理从网络接收的 Opus 数据
   */
  private handleOpusFromNetwork(opusFrame: Buffer): void {
    try {
      const opusCodec = getOpusCodec()
      if (!opusCodec) {
        logger.error('OpusCodec 未初始化')
        return
      }

      // 解码 Opus -> PCM (只解码一次!)
      const pcmBuffer = opusCodec.decode(opusFrame)

      // 1. 发送到后台音频窗口播放
      if (this.backgroundAudioWindow && !this.backgroundAudioWindow.isDestroyed()) {
        this.backgroundAudioWindow.webContents.send('audio:opus-decoded', pcmBuffer)
      }
      else {
        logger.warn('后台音频窗口不存在，无法播放音频')
      }

      // 2. 通过 EventBus 广播解码后的音频（Live2D ���订阅者接收）
      setImmediate(() => {
        if (this.ctx) {
          this.ctx.eventBus.emit(Events.AUDIO_DECODED, pcmBuffer).catch((error) => {
            logger.error('广播解码音频失败', error)
          })
        }
      })
    }
    catch (error) {
      logger.error('处理 Opus 数据失败', error)
    }
  }

  /**
   * 插件停止
   */
  async stop(): Promise<void> {
    await super.stop()
    logger.info('已停止')
  }

  /**
   * 插件关闭
   */
  async shutdown(): Promise<void> {
    logger.info('正在关闭...')

    // 停止后台音频窗口的采集
    if (this.backgroundAudioWindow && !this.backgroundAudioWindow.isDestroyed()) {
      logger.info('通知后台音频窗口停止采集并清理资源')
      this.backgroundAudioWindow.webContents.send('audio:command', 'cleanup')
    }

    // 清理 IPC 监听器（精确移除，避免误删其他模块的监听器）
    if (this.pcmHandler) {
      ipcMain.removeListener('audio:pcm', this.pcmHandler)
      this.pcmHandler = null
    }

    // 清理引用
    disposeOpusCodec()
    this.backgroundAudioWindow = null

    // ���用父类 shutdown
    await super.shutdown()

    logger.info('已关闭')
  }
}
