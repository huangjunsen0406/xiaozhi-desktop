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
 * - 处理 TTS 状态转换逻辑（incoming JSON 中的状态变更）
 */

import type { ListeningMode } from '@shared/types'
import type { Buffer } from 'node:buffer'
import type { AbortReason, Protocol } from '../protocols/Protocol'
import type { JsonMessage } from '../types/protocol'
import type { EventBus } from './EventBus'
import type { StateManager } from './StateManager'
import type { TaskManager } from './TaskManager'
import { DeviceStateValue, ListeningModeValue } from '@shared/types'
import { MqttProtocol } from '../protocols/MqttProtocol'
import { WebSocketProtocol } from '../protocols/WebSocketProtocol'
import { isTtsMessage } from '../types/protocol'
import { getLogger } from '../utils/logger'
import { Events } from './EventBus'

const logger = getLogger('ProtocolManager')

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

  /** 状态管理器引用 */
  private stateManager: StateManager

  /** 任务管理器引用 */
  private taskManager: TaskManager

  constructor(eventBus: EventBus, stateManager: StateManager, taskManager: TaskManager) {
    this.eventBus = eventBus
    this.stateManager = stateManager
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
  }

  // ========== 回调设置（协议事件 → EventBus） ==========

  /**
   * 设置协议回调
   *
   * 将协议底层事件转发到 EventBus，实现协议层与业务层解耦。
   */
  private setupCallbacks(): void {
    if (!this.protocol)
      return

    // 网络错误 → 重置状态 + 广播事件
    this.protocol.onNetworkError((error) => {
      logger.error('网络错误:', error)
      this.stateManager.setKeepListening(false)
      this.stateManager.setDeviceState(DeviceStateValue.IDLE).catch((err) => {
        logger.error('重置设备状态失败:', err)
      })
      this.eventBus.emit(Events.NETWORK_ERROR, error).catch(() => {})
    })

    // 收到 JSON 消息 → 处理状态转换 + 广播
    this.protocol.onIncomingJson((data) => {
      this.taskManager.spawn(
        this.handleIncomingJson(data),
        'handle:json',
      ).catch(() => {})
    })

    // 收到音频数据 → 广播
    this.protocol.onIncomingAudio((data) => {
      this.eventBus.emit(Events.INCOMING_AUDIO, data).catch(() => {})
    })

    // 音频通道打开 → 广播 + 设置状态
    this.protocol.onAudioChannelOpened(async () => {
      logger.info('音频通道已打开')
      await this.eventBus.emit(Events.AUDIO_CHANNEL_OPENED)
      await this.stateManager.setDeviceState(DeviceStateValue.LISTENING)
    })

    // 音频通道关闭 → 广播 + 设置状态
    this.protocol.onAudioChannelClosed(async () => {
      logger.info('音频通道已关闭')
      await this.eventBus.emit(Events.AUDIO_CHANNEL_CLOSED)
      await this.stateManager.setDeviceState(DeviceStateValue.IDLE)
    })
  }

  // ========== JSON 消息处理（TTS 状态转换） ==========

  /**
   * 处理接收到的 JSON 消息
   *
   * 负责 TTS 状态转换逻辑和事件广播。
   */
  private async handleIncomingJson(jsonData: JsonMessage): Promise<void> {
    try {
      logger.info(`收到 JSON 消息: type=${jsonData.type}`, jsonData)

      // 处理 TTS 消息的状态转换
      if (isTtsMessage(jsonData)) {
        const { state } = jsonData
        const sm = this.stateManager

        if (state === 'start') {
          if (sm.isKeepListening() && sm.getListeningMode() === ListeningModeValue.REALTIME) {
            await sm.setDeviceState(DeviceStateValue.LISTENING)
          }
          else {
            await sm.setDeviceState(DeviceStateValue.SPEAKING)
          }
        }
        else if (state === 'stop') {
          if (sm.isKeepListening()) {
            await this.restartListening()
          }
          else if (!sm.isListening()) {
            await sm.setDeviceState(DeviceStateValue.IDLE)
          }
        }
      }

      // 广播给插件
      await this.eventBus.emit(Events.INCOMING_JSON, jsonData)
    }
    catch (error) {
      logger.error('处理 JSON 消息失败:', error)
    }
  }

  /**
   * 重新开始监听（TTS 停止后自动恢复）
   */
  private async restartListening(): Promise<void> {
    const sm = this.stateManager
    const needSendStartListening = sm.getListeningMode() !== ListeningModeValue.REALTIME
    await sm.setDeviceState(DeviceStateValue.LISTENING)
    if (needSendStartListening) {
      await this.protocol?.sendStartListening(sm.getListeningMode())
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
   * 发送文本消息
   */
  async sendText(text: string): Promise<void> {
    if (this.protocol) {
      await this.protocol.sendText(text)
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
