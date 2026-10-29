/**
 * 服务容器
 *
 * 持有所有核心模块（EventBus、StateManager、TaskManager、ResourcePool、ProtocolManager），
 * 提供适配器给插件使用，实现依赖反转。
 *
 * 同时作为应用的公共 API 入口，替代原 Application God Object。
 * 所有 IPC 和外部模块通过 ServiceContainer 访问应用能力。
 *
 * v2.1 对齐：会话逻辑委托 ConversationSession；插件装配委托 pluginWiring；
 * McpServer / MusicPlayer 由容器持有并注入。
 *
 * **进程唯一根（有意保留）**：允许一个进程级 container，但必须
 * `createServiceContainer()` 显式创建后，`getServiceContainer()` 才可用；
 * 禁止业务路径 `new` 或懒创建第二实例。测试用 `resetInstance()`。
 */

import type { AppStateSnapshot, DeviceState, ListeningMode } from '@shared/types'
import type { BrowserWindow } from 'electron'
import type { Buffer } from 'node:buffer'
import type { ConversationSession } from '../bootstrap/ConversationSession'
import type { McpServer } from '../mcp/McpServer'
import type { MusicPlayer } from '../mcp/tools/music/MusicPlayer'
import type { AudioPlugin } from '../plugins/AudioPlugin'
import type { WakeWordPlugin } from '../plugins/WakeWordPlugin'
import type { AbortReason, Protocol } from '../protocols/Protocol'
import type { ShortcutManager } from '../services/ShortcutManager'
import type { PluginCommands, PluginContext } from './interfaces'
import { ConversationSession as ConversationSessionImpl } from '../bootstrap/ConversationSession'
import {
  registerCleanupResources,
  setAudioPluginBackgroundWindow,
  setupPlugins,
  setupShortcutManager,
} from '../bootstrap/pluginWiring'
import { PluginManager } from '../plugins/PluginManager'
import { getLogger } from '../utils/logger'
import { EventBus } from './EventBus'
import { ProtocolManager } from './ProtocolManager'
import { ResourcePool } from './ResourcePool'
import { StateManager } from './StateManager'
import { TaskManager } from './TaskManager'

const logger = getLogger('ServiceContainer')

/**
 * PluginContext 适配器
 *
 * 将 ServiceContainer 的状态查询能力通过窄接口暴露给插件。
 */
class PluginContextAdapter implements PluginContext {
  constructor(
    private container: ServiceContainer,
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

  isKeepListening(): boolean {
    return this.container.stateManager.isKeepListening()
  }

  isIdle(): boolean {
    return this.container.stateManager.isIdle()
  }

  isAudioChannelOpened(): boolean {
    return this.container.protocolManager.isAudioChannelOpened()
  }

  shouldCaptureAudio(): boolean {
    return this.container.stateManager.shouldCaptureAudio()
  }
}

/**
 * PluginCommands 适配器
 *
 * 将 ServiceContainer 的操作能力通过窄接口暴露给插件。
 * 会话操作委托 ConversationSession；协议发送委托 ProtocolManager。
 */
class PluginCommandsAdapter implements PluginCommands {
  constructor(
    private container: ServiceContainer,
  ) {}

  async startListening(mode: ListeningMode): Promise<void> {
    await this.container.session.startListening(mode)
  }

  async stopListening(): Promise<void> {
    await this.container.session.stopListening()
  }

  async abortSpeaking(reason: AbortReason): Promise<void> {
    await this.container.session.abortSpeaking(reason)
  }

  async sendAudio(data: Buffer): Promise<void> {
    await this.container.protocolManager.sendAudio(data)
  }

  async sendText(text: string): Promise<void> {
    // 与 ServiceContainer.sendText 对齐：打断说话 + 确保连接 + wake_word_detected 路径
    await this.container.session.sendText(text)
  }

  async connectProtocol(): Promise<boolean> {
    return this.container.session.connectProtocol()
  }

  async sendMcpMessage(message: string): Promise<void> {
    await this.container.protocolManager.sendMcpMessage(message)
  }

  async sendWakeWordDetected(text: string): Promise<void> {
    await this.container.session.sendWakeWordDetected(text)
  }

  track<T>(promise: Promise<T>, name: string): Promise<T> {
    return this.container.taskManager.track(promise, name)
  }
}

/** 进程唯一根引用（create 后可用；非懒创建） */
let _serviceContainer: ServiceContainer | null = null

/**
 * 服务容器
 *
 * 整合所有核心服务，作为应用的中央协调者。
 * 持有 ProtocolManager 与 ConversationSession；插件通过适配器间接使用。
 * 同时提供公共 API 供 IPC 和外部模块使用。
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

  /** 协议管理器 */
  readonly protocolManager: ProtocolManager

  /** 会话控制器（听/说/TTS） */
  readonly session: ConversationSession

  /** 插件管理器 */
  private plugins = new PluginManager()

  /** 容器持有的 McpServer（由 pluginWiring 创建） */
  mcpServer: McpServer | null = null

  /** 容器持有的 MusicPlayer（由 pluginWiring bindSharedServices 创建） */
  musicPlayer: MusicPlayer | null = null

  /** 音频插件引用 */
  private audioPlugin: AudioPlugin | null = null

  /** 唤醒词插件引用 */
  private wakeWordPlugin: WakeWordPlugin | null = null

  /** 快捷键管理器 */
  private shortcutManager: ShortcutManager | null = null

  /** 是否正在运行 */
  private running: boolean = false

  /** 适配器缓存 */
  private pluginContext: PluginContext | null = null
  private pluginCommands: PluginCommands | null = null

  private constructor() {
    logger.debug('初始化 ServiceContainer')

    this.eventBus = new EventBus()
    this.stateManager = new StateManager(this.eventBus)
    this.taskManager = new TaskManager()
    this.resourcePool = new ResourcePool()
    this.protocolManager = new ProtocolManager(this.eventBus, this.taskManager)
    this.session = new ConversationSessionImpl(
      this.stateManager,
      this.protocolManager,
      this.taskManager,
    )
  }

  /**
   * 显式创建进程唯一 ServiceContainer（启动路径）
   */
  static create(): ServiceContainer {
    if (_serviceContainer) {
      return _serviceContainer
    }
    _serviceContainer = new ServiceContainer()
    return _serviceContainer
  }

  /**
   * 重置进程根（仅测试用）
   */
  static resetInstance(): void {
    _serviceContainer = null
  }

  // ========== 生命周期 ==========

  /**
   * 初始化应用
   *
   * 初始化协议、绑定会话事件、注册并设置插件、注册快捷键、注册资源。
   *
   * @param protocolType 协议类型
   */
  async initialize(protocolType: 'websocket' | 'mqtt' = 'mqtt'): Promise<void> {
    logger.info(`初始化，协议类型: ${protocolType}`)

    // 通过 ProtocolManager 初始化协议
    this.protocolManager.initialize(protocolType)

    // 绑定会话事件（TTS / 通道 / 网络错误）
    this.session.bindEvents(this.eventBus)

    // 注册并 setup 插件（含 McpServer 注入、音频直连）
    const ctx = this.createPluginContext()
    const cmd = this.createPluginCommands()
    const { audioPlugin, wakeWordPlugin } = await setupPlugins(this, ctx, cmd)
    this.audioPlugin = audioPlugin
    this.wakeWordPlugin = wakeWordPlugin

    // 初始化快捷键
    this.shortcutManager = await setupShortcutManager(this)

    // 注册资源到资源池（逆序释放）
    registerCleanupResources(this, this.shortcutManager)

    logger.info('初始化完成')
  }

  /**
   * 启动应用
   */
  async start(): Promise<void> {
    logger.info('启动应用')
    this.running = true
    await this.plugins.startAll()
    // 广播初始状态
    await this.stateManager.setDeviceState(this.stateManager.getDeviceState())
    logger.info('应用启动完成')
  }

  /**
   * 关闭服务容器
   *
   * 通过资源池逆序释放所有资源。
   */
  async shutdown(): Promise<void> {
    if (!this.running) {
      return
    }
    this.running = false
    this.taskManager.requestShutdown()
    logger.info('正在关闭 ServiceContainer...')
    await this.resourcePool.shutdown()
    this.audioPlugin = null
    this.wakeWordPlugin = null
    this.shortcutManager = null
    this.mcpServer = null
    this.musicPlayer = null
    logger.info('ServiceContainer 关闭完成')
  }

  // ========== 公共 API（供 IPC / index.ts / ShortcutManager 使用） ==========

  /**
   * 连接协议
   */
  async connectProtocol(): Promise<boolean> {
    return this.session.connectProtocol()
  }

  /**
   * 手动开始监听
   */
  async startListeningManual(): Promise<void> {
    await this.session.startListeningManual()
  }

  /**
   * 手动停止监听
   */
  async stopListeningManual(): Promise<void> {
    await this.session.stopListeningManual()
  }

  /**
   * 开始自动对话
   */
  async startAutoConversation(): Promise<void> {
    await this.session.startAutoConversation()
  }

  /**
   * 停止自动对话
   */
  async stopAutoConversation(): Promise<void> {
    await this.session.stopAutoConversation()
  }

  /**
   * 中止语音输出
   */
  async abortSpeaking(reason: AbortReason): Promise<void> {
    await this.session.abortSpeaking(reason)
  }

  /**
   * 发送文本消息
   */
  async sendText(text: string): Promise<void> {
    await this.session.sendText(text)
  }

  /**
   * 发送唤醒词检测
   */
  async sendWakeWordDetected(text: string): Promise<void> {
    await this.session.sendWakeWordDetected(text)
  }

  /**
   * 打断语音输出并停止对话
   */
  async interruptSpeaking(): Promise<void> {
    await this.session.interruptSpeaking()
  }

  // ========== 只读访问器 ==========

  /**
   * 获取当前设备状态
   */
  getDeviceState(): DeviceState {
    return this.stateManager.getDeviceState()
  }

  /**
   * 获取协议实例（过渡兼容）
   */
  getProtocol(): Protocol | null {
    return this.protocolManager.getProtocol()
  }

  /**
   * 音频通道是否已打开
   */
  isAudioChannelOpened(): boolean {
    return this.protocolManager.isAudioChannelOpened()
  }

  /**
   * 获取插件管理器
   */
  getPluginManager(): PluginManager {
    return this.plugins
  }

  /**
   * 获取音频插件
   */
  getAudioPlugin(): AudioPlugin | null {
    return this.audioPlugin
  }

  /**
   * 获取唤醒词插件
   */
  getWakeWordPlugin(): WakeWordPlugin | null {
    return this.wakeWordPlugin
  }

  /**
   * 获取快捷键管理器
   */
  getShortcutManager(): ShortcutManager | null {
    return this.shortcutManager
  }

  /**
   * 获取容器持有的 McpServer
   */
  getMcpServer(): McpServer | null {
    return this.mcpServer
  }

  /**
   * 获取容器持有的 MusicPlayer
   */
  getMusicPlayer(): MusicPlayer | null {
    return this.musicPlayer
  }

  /**
   * 是否应该采集音频
   */
  shouldCaptureAudio(): boolean {
    return this.stateManager.shouldCaptureAudio()
  }

  /**
   * 获取应用状态快照
   */
  getStateSnapshot(): AppStateSnapshot {
    return {
      ...this.stateManager.getSnapshot(),
      channelOpen: this.isAudioChannelOpened(),
    }
  }

  /**
   * 重新加载协议配置
   */
  reloadProtocolConfig(): void {
    this.protocolManager.reloadConfig()
  }

  /**
   * 重连协议
   *
   * 刷新协议内存配置，断开当前连接并重新连接。
   * 用于音频参数或系统选项变更后，确保新 hello 携带最新配置。
   * 仅在当前有活跃连接时才执行断开重连。
   */
  async reconnectProtocol(): Promise<void> {
    if (!this.protocolManager.isAudioChannelOpened()) {
      logger.info('当前无活跃协议连接，跳过重连')
      // 仍刷新内存配置，下次连接生效
      this.protocolManager.reloadConfig()
      return
    }

    await this.session.reconnectKeepingIdle()
  }

  /**
   * 设置后台音频窗口到 AudioPlugin
   */
  setAudioPluginBackgroundWindow(window: BrowserWindow): void {
    setAudioPluginBackgroundWindow(this.audioPlugin, window)
  }

  // ========== 适配器工厂 ==========

  /**
   * 创建插件上下文适配器
   *
   * 返回只读的状态查询接口，插件通过此接口读取应用状态。
   */
  createPluginContext(): PluginContext {
    if (!this.pluginContext) {
      this.pluginContext = new PluginContextAdapter(this)
    }
    return this.pluginContext
  }

  /**
   * 创建插件命令适配器
   *
   * 返回受限的操作接口，插件通过此接口执行命令。
   */
  createPluginCommands(): PluginCommands {
    if (!this.pluginCommands) {
      this.pluginCommands = new PluginCommandsAdapter(this)
    }
    return this.pluginCommands
  }
}

/**
 * 显式创建进程唯一 ServiceContainer
 */
export function createServiceContainer(): ServiceContainer {
  return ServiceContainer.create()
}

/**
 * 获取已 create 的 ServiceContainer；未 create 则抛错
 *
 * 有意保留的进程根访问器（非懒创建）。
 */
export function getServiceContainer(): ServiceContainer {
  if (!_serviceContainer) {
    throw new Error(
      'ServiceContainer not initialized. Call createServiceContainer() during app bootstrap before getServiceContainer().',
    )
  }
  return _serviceContainer
}
