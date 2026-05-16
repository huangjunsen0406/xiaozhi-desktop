/**
 * 服务容器
 *
 * 持有所有核心模块（EventBus、StateManager、TaskManager、ResourcePool），
 * 提供适配器给插件使用，实现依赖反转。
 */

import type { DeviceState, ListeningMode } from '@shared/types'
import type { Buffer } from 'node:buffer'
import type { PluginCommands, PluginContext } from './interfaces'
import { getLogger } from '../utils/logger'
import { EventBus } from './EventBus'
import { ResourcePool } from './ResourcePool'
import { StateManager } from './StateManager'
import { TaskManager } from './TaskManager'

const logger = getLogger('ServiceContainer')

/**
 * 协议操作委托接口
 *
 * ServiceContainer 不直接依赖具体的 Protocol 实现，
 * 而是通过此接口将协议操作委托给外部（Application 编排层）。
 */
export interface ProtocolDelegate {
  /** 音频通道是否已打开 */
  isAudioChannelOpened: () => boolean
  /** 发送音频数据 */
  sendAudio: (data: Buffer) => Promise<void>
  /** 发送文本消息 */
  sendText: (text: string) => Promise<void>
  /** 连接协议通道 */
  connectProtocol: () => Promise<boolean>
  /** 开始监听 */
  startListening: (mode: ListeningMode) => Promise<void>
  /** 停止监听 */
  stopListening: () => Promise<void>
  /** 中止语音输出 */
  abortSpeaking: (reason: string) => Promise<void>
}

/**
 * PluginContext 适配器
 *
 * 将 ServiceContainer 的状态查询能力通过窄接口暴露给插件。
 */
class PluginContextAdapter implements PluginContext {
  constructor(
    private container: ServiceContainer,
    private protocolDelegate: ProtocolDelegate,
  ) {}

  get eventBus(): EventBus {
    return this.container.eventBus
  }

  getDeviceState(): DeviceState {
    return this.container.stateManager.getDeviceState()
  }

  getListeningMode(): ListeningMode {
    return this.container.stateManager.getListeningMode()
  }

  isListening(): boolean {
    return this.container.stateManager.isListening()
  }

  isSpeaking(): boolean {
    return this.container.stateManager.isSpeaking()
  }

  isIdle(): boolean {
    return this.container.stateManager.isIdle()
  }

  isAudioChannelOpened(): boolean {
    return this.protocolDelegate.isAudioChannelOpened()
  }

  shouldCaptureAudio(): boolean {
    return this.container.stateManager.shouldCaptureAudio()
  }
}

/**
 * PluginCommands 适配器
 *
 * 将 ServiceContainer 的操作能力通过窄接口暴露给插件。
 */
class PluginCommandsAdapter implements PluginCommands {
  constructor(
    private container: ServiceContainer,
    private protocolDelegate: ProtocolDelegate,
  ) {}

  async startListening(mode: ListeningMode): Promise<void> {
    await this.protocolDelegate.startListening(mode)
  }

  async stopListening(): Promise<void> {
    await this.protocolDelegate.stopListening()
  }

  async abortSpeaking(reason: string): Promise<void> {
    await this.protocolDelegate.abortSpeaking(reason)
  }

  async sendAudio(data: Buffer): Promise<void> {
    await this.protocolDelegate.sendAudio(data)
  }

  async sendText(text: string): Promise<void> {
    await this.protocolDelegate.sendText(text)
  }

  async connectProtocol(): Promise<boolean> {
    return this.protocolDelegate.connectProtocol()
  }

  spawn<T>(promise: Promise<T>, name: string): Promise<T> {
    return this.container.taskManager.spawn(promise, name)
  }
}

/**
 * 服务容器
 *
 * 整合所有核心服务，作为应用的中央协调者。
 * 不承载业务逻辑，只负责组合和适配。
 */
export class ServiceContainer {
  /** 事件总线 */
  readonly eventBus: EventBus

  /** 状态管理器 */
  readonly stateManager: StateManager

  /** 任务管理器 */
  readonly taskManager: TaskManager

  /** 资源池 */
  readonly resourcePool: ResourcePool

  /** 适配器缓存 */
  private pluginContext: PluginContext | null = null
  private pluginCommands: PluginCommands | null = null

  constructor() {
    logger.debug('初始化 ServiceContainer')

    this.eventBus = new EventBus()
    this.stateManager = new StateManager(this.eventBus)
    this.taskManager = new TaskManager()
    this.resourcePool = new ResourcePool()
  }

  /**
   * 创建插件上下文适配器
   *
   * 返回只读的状态查询接口，插件通过此接口读取应用状态。
   *
   * @param delegate 协议操作委托
   * @returns PluginContext 实例
   */
  createPluginContext(delegate: ProtocolDelegate): PluginContext {
    if (!this.pluginContext) {
      this.pluginContext = new PluginContextAdapter(this, delegate)
    }
    return this.pluginContext
  }

  /**
   * 创建插件命令适配器
   *
   * 返回受限的操作接口，插件通过此接口执行命令。
   *
   * @param delegate 协议操作委托
   * @returns PluginCommands 实例
   */
  createPluginCommands(delegate: ProtocolDelegate): PluginCommands {
    if (!this.pluginCommands) {
      this.pluginCommands = new PluginCommandsAdapter(this, delegate)
    }
    return this.pluginCommands
  }

  /**
   * 关闭服务容器
   *
   * 通过资源池逆序释放所有资源。
   */
  async shutdown(): Promise<void> {
    logger.info('正在关闭 ServiceContainer...')
    await this.resourcePool.shutdown()
    logger.info('ServiceContainer 关闭完成')
  }
}
