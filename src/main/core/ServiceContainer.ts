/**
 * 服务容器
 *
 * 持有所有核心模块（EventBus、StateManager、TaskManager、ResourcePool、ProtocolManager），
 * 提供适配器给插件使用，实现依赖反转。
 *
 * 同时作为应用的公共 API 入口，替代原 Application God Object。
 * 所有 IPC 和外部模块通过 ServiceContainer 访问应用能力。
 */

import type { AppStateSnapshot, DeviceState, ListeningMode } from '@shared/types'
import type { BrowserWindow } from 'electron'
import type { Buffer } from 'node:buffer'
import type { AbortReason, Protocol } from '../protocols/Protocol'
import type { PluginCommands, PluginContext } from './interfaces'
import { DeviceStateValue, ListeningModeValue } from '@shared/types'
import { getAudioConfig } from '../ipc/audioIpc'
import { AudioPlugin } from '../plugins/AudioPlugin'
import { ChatPlugin } from '../plugins/ChatPlugin'
import { Live2DPlugin } from '../plugins/Live2DPlugin'
import { McpPlugin } from '../plugins/McpPlugin'
import { PluginManager } from '../plugins/PluginManager'
import { UIPlugin } from '../plugins/UIPlugin'
import { WakeWordPlugin } from '../plugins/WakeWordPlugin'
import { AbortReason as AbortReasonEnum } from '../protocols/Protocol'
import { DatabaseManager } from '../services/database'
import { ShortcutManager } from '../services/ShortcutManager'
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
 * 所有协议操作直接委托给 ProtocolManager，不再绕经 ProtocolDelegate。
 */
class PluginCommandsAdapter implements PluginCommands {
  constructor(
    private container: ServiceContainer,
  ) {}

  async startListening(mode: ListeningMode): Promise<void> {
    const sm = this.container.stateManager
    const pm = this.container.protocolManager

    // 设置监听模式和持续监听标志
    sm.setListeningMode(mode)
    sm.setKeepListening(mode === ListeningModeValue.REALTIME || mode === ListeningModeValue.AUTO)
    await sm.setDeviceState(DeviceStateValue.CONNECTING)

    // 先关闭旧连接（确保每次对话使用新 session）
    if (pm.isAudioChannelOpened()) {
      await pm.closeAudioChannel()
    }

    // 建立新连接
    const connected = await pm.openAudioChannel()
    if (!connected) {
      sm.setKeepListening(false)
      await sm.setDeviceState(DeviceStateValue.IDLE)
      return
    }

    await pm.sendStartListening(mode)
    await sm.setDeviceState(DeviceStateValue.LISTENING)
  }

  async stopListening(): Promise<void> {
    await this.container.protocolManager.sendStopListening()
  }

  async abortSpeaking(reason: string): Promise<void> {
    await this.container.protocolManager.sendAbort(reason as AbortReason)
  }

  async sendAudio(data: Buffer): Promise<void> {
    await this.container.protocolManager.sendAudio(data)
  }

  async sendText(text: string): Promise<void> {
    // 发送文本前确保协议已连接
    const connected = await this.container.protocolManager.openAudioChannel()
    if (!connected) return
    await this.container.protocolManager.sendText(text)
  }

  async connectProtocol(): Promise<boolean> {
    return this.container.protocolManager.openAudioChannel()
  }

  async sendMcpMessage(message: string): Promise<void> {
    await this.container.protocolManager.sendMcpMessage(message)
  }

  async sendWakeWordDetected(text: string): Promise<void> {
    await this.container.protocolManager.sendWakeWordDetected(text)
  }

  spawn<T>(promise: Promise<T>, name: string): Promise<T> {
    return this.container.taskManager.spawn(promise, name)
  }
}

/**
 * 服务容器
 *
 * 整合所有核心服务，作为应用的中央协调者。
 * 持有 ProtocolManager，插件通过适配器间接使用协议能力。
 * 同时提供公共 API 供 IPC 和外部模块使用。
 */
export class ServiceContainer {
  private static instance: ServiceContainer | null = null

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

  /** 插件管理器 */
  private plugins = new PluginManager()

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
    this.protocolManager = new ProtocolManager(this.eventBus, this.stateManager, this.taskManager)
  }

  /**
   * 获取 ServiceContainer 单例
   */
  static getInstance(): ServiceContainer {
    if (!ServiceContainer.instance) {
      ServiceContainer.instance = new ServiceContainer()
    }
    return ServiceContainer.instance
  }

  // ========== 生命周期 ==========

  /**
   * 初始化应用
   *
   * 初始化协议、注册并设置插件、注册快捷键、注册资源。
   *
   * @param protocolType 协议类型
   */
  async initialize(protocolType: 'websocket' | 'mqtt' = 'mqtt'): Promise<void> {
    logger.info(`初始化，协议类型: ${protocolType}`)

    // 通过 ProtocolManager 初始化协议
    this.protocolManager.initialize(protocolType)

    // 注册插件
    this.audioPlugin = new AudioPlugin()
    this.wakeWordPlugin = new WakeWordPlugin()
    this.plugins.register(
      this.audioPlugin,
      new Live2DPlugin(),
      new McpPlugin(),
      new ChatPlugin(),
      this.wakeWordPlugin,
      new UIPlugin(),
    )

    // 初始化插件（拓扑排序 + 依赖注入）
    const ctx = this.createPluginContext()
    const cmd = this.createPluginCommands()
    await this.plugins.setupAll(ctx, cmd)

    // 初始化快捷键
    const db = DatabaseManager.getInstance()
    this.shortcutManager = new ShortcutManager(db, this)
    await this.shortcutManager.registerAll()

    // 注册资源到资源池（逆序释放）
    this.resourcePool.register('shortcutManager', () => {
      this.shortcutManager?.destroy()
      this.shortcutManager = null
    })
    this.resourcePool.register('plugins', async () => {
      await this.plugins.stopAll()
      await this.plugins.shutdownAll()
    })
    this.resourcePool.register('protocol', async () => {
      await this.protocolManager.shutdown()
    })
    this.resourcePool.register('tasks', async () => {
      await this.taskManager.cancelAll(3000)
    })
    this.resourcePool.register('eventBus', () => {
      this.eventBus.clear()
    })

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
    logger.info('正在关闭 ServiceContainer...')
    await this.resourcePool.shutdown()
    this.audioPlugin = null
    this.wakeWordPlugin = null
    logger.info('ServiceContainer 关闭完成')
  }

  // ========== 公共 API（供 IPC / index.ts / ShortcutManager 使用） ==========

  /**
   * 连接协议
   */
  async connectProtocol(): Promise<boolean> {
    return this.protocolManager.openAudioChannel()
  }

  /**
   * 手动开始监听
   */
  async startListeningManual(): Promise<void> {
    const sm = this.stateManager
    const pm = this.protocolManager
    const ok = await this.connectProtocol()
    if (!ok)
      return
    sm.setListeningMode(ListeningModeValue.MANUAL)
    sm.setKeepListening(false)
    if (sm.isSpeaking()) {
      await pm.sendAbort(AbortReasonEnum.USER_INTERRUPTED)
      await sm.setDeviceState(DeviceStateValue.IDLE)
    }
    await pm.sendStartListening(ListeningModeValue.MANUAL)
    await sm.setDeviceState(DeviceStateValue.LISTENING)
  }

  /**
   * 手动停止监听
   */
  async stopListeningManual(): Promise<void> {
    await this.protocolManager.sendStopListening()
    await this.stateManager.setDeviceState(DeviceStateValue.IDLE)
  }

  /**
   * 开始自动对话
   */
  async startAutoConversation(): Promise<void> {
    const sm = this.stateManager
    const pm = this.protocolManager
    const audioConfig = getAudioConfig()
    const conversationMode = audioConfig.conversationMode || 'auto'
    const mode: ListeningMode = conversationMode === 'realtime'
      ? ListeningModeValue.REALTIME
      : ListeningModeValue.AUTO

    sm.setListeningMode(mode)
    sm.setKeepListening(true)
    await sm.setDeviceState(DeviceStateValue.CONNECTING)

    const ok = await this.connectProtocol()
    if (!ok) {
      sm.setKeepListening(false)
      await sm.setDeviceState(DeviceStateValue.IDLE)
      return
    }
    await pm.sendStartListening(mode)
    await sm.setDeviceState(DeviceStateValue.LISTENING)
  }

  /**
   * 停止自动对话
   */
  async stopAutoConversation(): Promise<void> {
    const sm = this.stateManager
    const pm = this.protocolManager
    sm.setKeepListening(false)
    if (sm.isSpeaking()) {
      await pm.sendAbort(AbortReasonEnum.USER_INTERRUPTED)
    }
    await pm.sendStopListening()
    await pm.closeAudioChannel()
    await sm.setDeviceState(DeviceStateValue.IDLE)
  }

  /**
   * 中止语音输出
   */
  async abortSpeaking(reason: AbortReason): Promise<void> {
    const sm = this.stateManager
    if (sm.isAborted())
      return
    sm.setAborted(true)
    await this.protocolManager.sendAbort(reason)
    await sm.setDeviceState(DeviceStateValue.IDLE)
  }

  /**
   * 发送文本消息
   */
  async sendText(text: string): Promise<void> {
    const sm = this.stateManager
    if (sm.isSpeaking()) {
      await this.abortSpeaking(AbortReasonEnum.USER_INTERRUPTED)
    }
    const ok = await this.connectProtocol()
    if (!ok)
      return
    await this.protocolManager.sendWakeWordDetected(text)
  }

  /**
   * 发送唤醒词检测
   */
  async sendWakeWordDetected(text: string): Promise<void> {
    const ok = await this.connectProtocol()
    if (!ok)
      return
    await this.protocolManager.sendWakeWordDetected(text)
  }

  /**
   * 打断语音输出并停止对话
   */
  async interruptSpeaking(): Promise<void> {
    if (this.stateManager.isSpeaking()) {
      await this.stopAutoConversation()
    }
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
   * 设置后台音频窗口到 AudioPlugin
   */
  setAudioPluginBackgroundWindow(window: BrowserWindow): void {
    if (this.audioPlugin) {
      this.audioPlugin.setBackgroundAudioWindow(window)
      logger.info('AudioPlugin 窗口引用已设置')
    }
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
 * 获取 ServiceContainer 单例
 */
export function getServiceContainer(): ServiceContainer {
  return ServiceContainer.getInstance()
}
