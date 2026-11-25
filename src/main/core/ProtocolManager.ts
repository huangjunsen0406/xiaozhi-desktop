/**
 * 协议管理器
 *
 * 封装 MQTT 协议的生命周期：创建、回调转发到 EventBus、连接锁、消息发送、入站音频直连。
 */

import type { ListeningMode, ServerMessage } from '@shared/types'
import type { Buffer } from 'node:buffer'
import type { AbortReason, Protocol } from '../protocols/Protocol'
import type { EventBus } from './EventBus'
import type { TaskManager } from './TaskManager'
import { MqttProtocol } from '../protocols/MqttProtocol'
import { WebSocketProtocol } from '../protocols/WebSocketProtocol'
import { getLogger } from '../utils/logger'
import { Events } from './EventBus'

const logger = getLogger('ProtocolManager')

/** 入站音频直连处理器 */
export type IncomingAudioHandler = (data: Buffer) => void | Promise<void>

export class ProtocolManager {
  private protocol: Protocol | null = null
  private connectLock: Promise<boolean> | null = null
  private incomingAudioHandler: IncomingAudioHandler | null = null

  constructor(
    private eventBus: EventBus,
    private taskManager: TaskManager,
  ) {}

  initialize(type: 'websocket' | 'mqtt' = 'websocket'): void {
    logger.info(`初始化协议: ${type}`)
    this.protocol = type === 'mqtt' ? new MqttProtocol() : new WebSocketProtocol()
    this.setupCallbacks()
  }

  async shutdown(): Promise<void> {
    if (this.protocol) {
      try {
        await this.protocol.closeAudioChannel()
      }
      catch (error) {
        logger.error('关闭协议失败:', error)
      }
      this.protocol = null
    }
    this.connectLock = null
    this.incomingAudioHandler = null
  }

  setAudioHandler(handler: IncomingAudioHandler | null): void {
    this.incomingAudioHandler = handler
    logger.debug(handler ? '入站音频直连 handler 已设置' : '入站音频直连 handler 已清除')
  }

  private setupCallbacks(): void {
    if (!this.protocol)
      return

    this.protocol.onNetworkError((error) => {
      logger.error('网络错误:', error)
      void this.eventBus.emit(Events.NETWORK_ERROR, error)
    })

    this.protocol.onIncomingJson((data) => {
      this.taskManager.run(
        () => this.handleIncomingJson(data),
        'handle:json',
      ).catch(() => {})
    })

    this.protocol.onIncomingAudio((data) => {
      if (this.incomingAudioHandler) {
        try {
          void Promise.resolve(this.incomingAudioHandler(data)).catch((error) => {
            logger.error('入站音频直连 handler 失败', error)
          })
        }
        catch (error) {
          logger.error('入站音频直连 handler 同步失败', error)
        }
      }
      else {
        void this.eventBus.emit(Events.INCOMING_AUDIO, data)
      }
    })

    this.protocol.onAudioChannelOpened(async () => {
      logger.info('音频通道已打开')
      await this.eventBus.emit(Events.AUDIO_CHANNEL_OPENED)
    })

    this.protocol.onAudioChannelClosed(async () => {
      logger.info('音频通道已关闭')
      await this.eventBus.emit(Events.AUDIO_CHANNEL_CLOSED)
    })
  }

  private async handleIncomingJson(jsonData: ServerMessage): Promise<void> {
    logger.info(`收到 JSON 消息: type=${jsonData.type}`, jsonData)
    await this.eventBus.emit(Events.INCOMING_JSON, jsonData)
  }

  async openAudioChannel(): Promise<boolean> {
    if (!this.protocol)
      return false
    if (this.protocol.isAudioChannelOpened())
      return true

    if (!this.connectLock) {
      this.connectLock = (async () => {
        try {
          if (this.protocol?.isAudioChannelOpened())
            return true
          const opened = await this.protocol?.openAudioChannel()
          if (!opened) {
            logger.error('协议连接失败')
            return false
          }
          logger.info('协议连接已建立')
          if (this.protocol)
            await this.eventBus.emit(Events.PROTOCOL_CONNECTED, this.protocol)
          return true
        }
        catch (error) {
          logger.error('连接协议时出错:', error)
          return false
        }
        finally {
          this.connectLock = null
        }
      })()
    }

    return await this.connectLock
  }

  async closeAudioChannel(): Promise<void> {
    if (this.protocol) {
      await this.protocol.closeAudioChannel()
    }
  }

  async sendAudio(data: Buffer): Promise<void> {
    if (this.protocol && this.protocol.isAudioChannelOpened()) {
      await this.protocol.sendAudio(data)
    }
  }

  async sendMcpMessage(message: string): Promise<void> {
    if (this.protocol) {
      await this.protocol.sendMcpMessage(message)
    }
  }

  async sendAbort(reason: AbortReason): Promise<void> {
    if (this.protocol) {
      await this.protocol.sendAbortSpeaking(reason)
    }
  }

  async sendWakeWordDetected(text: string): Promise<void> {
    if (this.protocol) {
      await this.protocol.sendWakeWordDetected(text)
    }
  }

  async sendStartListening(mode: ListeningMode): Promise<void> {
    if (this.protocol) {
      await this.protocol.sendStartListening(mode)
    }
  }

  async sendStopListening(): Promise<void> {
    if (this.protocol) {
      await this.protocol.sendStopListening()
    }
  }

  isAudioChannelOpened(): boolean {
    return this.protocol?.isAudioChannelOpened() ?? false
  }

  getProtocol(): Protocol | null {
    return this.protocol
  }

  reloadConfig(): void {
    this.protocol?.reloadConfig()
  }
}
