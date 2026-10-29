/**
 * 协议管理器
 *
 * 封装通信协议的完整生命周期：创建、回调设置、连接管理、消息发送。
 * 参考 Python 版 ProtocolManager 架构，将 Transport 和 Gateway 职责内聚。
 *
 * 职责：
 * - 协议实例创建（WebSocket / MQTT）
 * - 设置协议回调并自动转发到 EventBus
 * - 管理连接锁（防止并发连接）
 * - 暴露统一的发送方法（音频、文本、MCP、唤醒词等）
 * - 暴露状态查询（音频通道是否打开）
 * - 入站音频直连 handler（生产路径）+ EventBus fallback
 *
 * 注意：TTS 状态迁移已迁至 ConversationSession，本类只广播 INCOMING_JSON。
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

/**
 * 协议管理器
 *
 * 对外暴露统一接口，内部组合协议传输与消息网关能力。
 * 插件和外部模块通过此类操作协议，不直接接触 Protocol 实例。
 */
export class ProtocolManager {
  /** 协议实例 */
  private protocol: Protocol | null = null

  /** 连接锁（防止并发连接） */
  private connectLock: Promise<boolean> | null = null

  /** 事件总线引用 */
  private eventBus: EventBus

  /** 任务管理器引用 */
  private taskManager: TaskManager

  /**
   * 入站音频直连 handler（生产路径）
   * 设置后绕过 EventBus，减少 TTS 延迟；未设置时 fallback 到 EventBus
   */
  private incomingAudioHandler: IncomingAudioHandler | null = null

  constructor(eventBus: EventBus, taskManager: TaskManager) {
    this.eventBus = eventBus
    this.taskManager = taskManager
  }

  // ========== 初始化与生命周期 ==========

  /**
   * 初始化协议（创建实例 + 设置回调）
   *
   * @param type 协议类型：'websocket' 或 'mqtt'
   */
  initialize(type: 'websocket' | 'mqtt'): void {
    logger.info(`初始化协议，类型: ${type}`)
    this.protocol = type === 'mqtt' ? new MqttProtocol() : new WebSocketProtocol()
    this.setupCallbacks()
  }

  /**
   * 关闭协议管理器，释放所有资源
   */
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

  // ========== 音频直连 ==========

  /**
   * 设置入站音频直连 handler
   *
   * 生产路径由 pluginWiring 在 AudioPlugin setup 后注入，
   * 绕过 EventBus 减少 per-frame 开销。传 null 清除。
   */
  setAudioHandler(handler: IncomingAudioHandler | null): void {
    this.incomingAudioHandler = handler
    logger.debug(handler ? '入站音频直连 handler 已设置' : '入站音频直连 handler 已清除')
  }

  // ========== 回调设置（协议事件 → EventBus / 直连） ==========

  /**
   * 设置协议回调
   *
   * 将协议底层事件转发到 EventBus，实现协议层与业务层解耦。
   * 入站音频优先走直连 handler。
   */
  private setupCallbacks(): void {
    if (!this.protocol)
      return

    // 网络错误 → 广播事件（状态复位由 ConversationSession 订阅处理）
    this.protocol.onNetworkError((error) => {
      logger.error('网络错误:', error)
      this.eventBus.emit(Events.NETWORK_ERROR, error).catch(() => {})
    })

    // 收到 JSON 消息 → 广播（TTS 状态迁移由 ConversationSession 订阅处理）
    this.protocol.onIncomingJson((data) => {
      this.taskManager.run(
        () => this.handleIncomingJson(data),
        'handle:json',
      ).catch(() => {})
    })

    // 收到音频数据 → 直连 handler 优先，否则 EventBus fallback
    this.protocol.onIncomingAudio((data) => {
      if (this.incomingAudioHandler) {
        try {
          const result = this.incomingAudioHandler(data)
          if (result && typeof (result as Promise<void>).then === 'function') {
            ;(result as Promise<void>).catch((error) => {
              logger.error('入站音频直连 handler 失败', error)
            })
          }
        }
        catch (error) {
          logger.error('入站音频直连 handler 同步失败', error)
        }
      }
      else {
        this.eventBus.emit(Events.INCOMING_AUDIO, data).catch(() => {})
      }
    })

    // 音频通道打开 → 广播（状态由 ConversationSession 订阅处理）
    this.protocol.onAudioChannelOpened(async () => {
      logger.info('音频通道已打开')
      await this.eventBus.emit(Events.AUDIO_CHANNEL_OPENED)
    })

    // 音频通道关闭 → 广播（状态由 ConversationSession 订阅处理）
    this.protocol.onAudioChannelClosed(async () => {
      logger.info('音频通道已关闭')
      await this.eventBus.emit(Events.AUDIO_CHANNEL_CLOSED)
    })
  }

  // ========== JSON 消息处理 ==========

  /**
   * 处理接收到的 JSON 消息
   *
   * 仅负责日志与事件广播；TTS 状态迁移已迁至 ConversationSession。
   */
  private async handleIncomingJson(jsonData: ServerMessage): Promise<void> {
    try {
      logger.info(`收到 JSON 消息: type=${jsonData.type}`, jsonData)
      // 广播给插件与 ConversationSession
      await this.eventBus.emit(Events.INCOMING_JSON, jsonData)
    }
    catch (error) {
      logger.error('处理 JSON 消息失败:', error)
    }
  }

  // ========== 连接管理 ==========

  /**
   * 打开音频通道（带连接锁，防止并发）
   *
   * @returns 是否成功打开
   */
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

  /**
   * 关闭音频通道
   */
  async closeAudioChannel(): Promise<void> {
    if (this.protocol) {
      await this.protocol.closeAudioChannel()
    }
  }

  // ========== 发送方法（Gateway） ==========

  /**
   * 发送音频数据
   *
   * 仅在音频通道打开时发送。
   */
  async sendAudio(data: Buffer): Promise<void> {
    if (this.protocol && this.protocol.isAudioChannelOpened()) {
      await this.protocol.sendAudio(data)
    }
  }

  /**
   * 发送传输层文本帧（已序列化的协议 JSON 字符串），非用户话语。
   * 用户话语请走 ConversationSession.sendText。
   */
  async sendRawText(text: string): Promise<void> {
    if (this.protocol) {
      await this.protocol.sendRawText(text)
    }
  }

  /**
   * 发送 MCP 消息
   */
  async sendMcpMessage(message: string): Promise<void> {
    if (this.protocol) {
      await this.protocol.sendMcpMessage(message)
    }
  }

  /**
   * 发送中止语音指令
   */
  async sendAbort(reason: AbortReason): Promise<void> {
    if (this.protocol) {
      await this.protocol.sendAbortSpeaking(reason)
    }
  }

  /**
   * 发送唤醒词检测消息
   */
  async sendWakeWordDetected(text: string): Promise<void> {
    if (this.protocol) {
      await this.protocol.sendWakeWordDetected(text)
    }
  }

  /**
   * 发送开始监听指令
   */
  async sendStartListening(mode: ListeningMode): Promise<void> {
    if (this.protocol) {
      await this.protocol.sendStartListening(mode)
    }
  }

  /**
   * 发送停止监听指令
   */
  async sendStopListening(): Promise<void> {
    if (this.protocol) {
      await this.protocol.sendStopListening()
    }
  }

  // ========== 状态查询 ==========

  /**
   * 音频通道是否已打开
   */
  isAudioChannelOpened(): boolean {
    return this.protocol?.isAudioChannelOpened() ?? false
  }

  /**
   * 获取协议实例（仅供过渡期兼容使用，后续应移除）
   */
  getProtocol(): Protocol | null {
    return this.protocol
  }

  /**
   * 重新加载协议配置
   */
  reloadConfig(): void {
    if (!this.protocol)
      return
    if ('reloadConfig' in this.protocol && typeof this.protocol.reloadConfig === 'function') {
      this.protocol.reloadConfig()
    }
  }
}
