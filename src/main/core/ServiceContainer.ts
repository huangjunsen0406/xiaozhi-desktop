/**
 * 服务容器（进程唯一根）
 *
 * 持有所有核心模块（EventBus、StateManager、TaskManager、ResourcePool、ProtocolManager、ConversationSession），
 * 通过窄接口将只读状态与命令暴露给插件。
 */

import type { AppStateSnapshot, DeviceState } from '@shared/types'
import type { BrowserWindow } from 'electron'
import type { McpServer } from '../mcp/McpServer'
import type { MusicPlayer } from '../mcp/tools/music/MusicPlayer'
import type { AudioPlugin } from '../plugins/AudioPlugin'
import type { WakeWordPlugin } from '../plugins/WakeWordPlugin'
import type { Protocol } from '../protocols/Protocol'
import type { ShortcutManager } from '../services/ShortcutManager'
import type { PluginCommands, PluginContext } from './interfaces'
import { ConversationSession } from '../bootstrap/ConversationSession'
import {
  registerCleanupResources,
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

let _serviceContainer: ServiceContainer | null = null

export class ServiceContainer {
  readonly eventBus: EventBus
  readonly stateManager: StateManager
  readonly taskManager: TaskManager
  readonly resourcePool: ResourcePool
  readonly protocolManager: ProtocolManager
  readonly session: ConversationSession

  private plugins = new PluginManager()
  mcpServer: McpServer | null = null
  musicPlayer: MusicPlayer | null = null

  private audioPlugin: AudioPlugin | null = null
  private wakeWordPlugin: WakeWordPlugin | null = null
  private shortcutManager: ShortcutManager | null = null
  private running: boolean = false
  private pluginContext: PluginContext | null = null
  private pluginCommands: PluginCommands | null = null

  private constructor() {
    logger.debug('初始化 ServiceContainer')
    this.eventBus = new EventBus()
    this.stateManager = new StateManager(this.eventBus)
    this.taskManager = new TaskManager()
    this.resourcePool = new ResourcePool()
    this.protocolManager = new ProtocolManager(this.eventBus, this.taskManager)
    this.session = new ConversationSession(
      this.stateManager,
      this.protocolManager,
      this.taskManager,
    )
  }

  static create(): ServiceContainer {
    if (_serviceContainer)
      return _serviceContainer
    _serviceContainer = new ServiceContainer()
    return _serviceContainer
  }

  static resetInstance(): void {
    _serviceContainer = null
  }

  async initialize(protocolType: 'websocket' | 'mqtt' = 'websocket'): Promise<void> {
    logger.info(`初始化 ServiceContainer (${protocolType})`)
    this.protocolManager.initialize(protocolType)
    this.session.bindEvents(this.eventBus)

    const { audioPlugin, wakeWordPlugin } = await setupPlugins(
      this,
      this.createPluginContext(),
      this.createPluginCommands(),
    )
    this.audioPlugin = audioPlugin
    this.wakeWordPlugin = wakeWordPlugin

    this.shortcutManager = await setupShortcutManager(this)
    registerCleanupResources(this, this.shortcutManager)
    logger.info('初始化完成')
  }

  async start(): Promise<void> {
    logger.info('启动应用')
    this.running = true
    await this.plugins.startAll()
    logger.info('应用启动完成')
  }

  async shutdown(): Promise<void> {
    if (!this.running)
      return
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

  // ========== 会话控制 ==========

  startListeningManual(): Promise<void> {
    return this.session.startListeningManual()
  }

  stopListeningManual(): Promise<void> {
    return this.session.stopListeningManual()
  }

  startAutoConversation(): Promise<void> {
    return this.session.startAutoConversation()
  }

  stopAutoConversation(): Promise<void> {
    return this.session.stopAutoConversation()
  }

  sendText(text: string): Promise<void> {
    return this.session.sendText(text)
  }

  sendWakeWordDetected(text: string): Promise<void> {
    return this.session.sendWakeWordDetected(text)
  }

  interruptSpeaking(): Promise<void> {
    return this.session.interruptSpeaking()
  }

  // ========== 状态与服务访问 ==========

  getDeviceState(): DeviceState {
    return this.stateManager.getDeviceState()
  }

  getProtocol(): Protocol | null {
    return this.protocolManager.getProtocol()
  }

  isAudioChannelOpened(): boolean {
    return this.protocolManager.isAudioChannelOpened()
  }

  getPluginManager(): PluginManager {
    return this.plugins
  }

  getWakeWordPlugin(): WakeWordPlugin | null {
    return this.wakeWordPlugin
  }

  getShortcutManager(): ShortcutManager | null {
    return this.shortcutManager
  }

  getMcpServer(): McpServer | null {
    return this.mcpServer
  }

  getMusicPlayer(): MusicPlayer | null {
    return this.musicPlayer
  }

  getStateSnapshot(): AppStateSnapshot {
    return {
      ...this.stateManager.getSnapshot(),
      channelOpen: this.isAudioChannelOpened(),
    }
  }

  reloadProtocolConfig(): void {
    this.protocolManager.reloadConfig()
  }

  async reconnectProtocol(): Promise<void> {
    await this.session.reconnectKeepingIdle()
  }

  setAudioPluginBackgroundWindow(window: BrowserWindow): void {
    if (this.audioPlugin) {
      this.audioPlugin.setBackgroundAudioWindow(window)
      logger.info('后台音频窗口已设置到 AudioPlugin')
    }
  }

  createPluginContext(): PluginContext {
    if (!this.pluginContext) {
      this.pluginContext = {
        eventBus: this.eventBus,
        getDeviceState: () => this.stateManager.getDeviceState(),
        getListeningMode: () => this.stateManager.getListeningMode(),
        isKeepListening: () => this.stateManager.isKeepListening(),
        isAudioChannelOpened: () => this.protocolManager.isAudioChannelOpened(),
        shouldCaptureAudio: () => this.stateManager.shouldCaptureAudio(),
      }
    }
    return this.pluginContext
  }

  createPluginCommands(): PluginCommands {
    if (!this.pluginCommands) {
      this.pluginCommands = {
        startListening: mode => this.session.startListening(mode),
        stopListening: () => this.session.stopListening(),
        abortSpeaking: reason => this.session.abortSpeaking(reason),
        sendAudio: data => this.protocolManager.sendAudio(data),
        sendMcpMessage: message => this.protocolManager.sendMcpMessage(message),
        sendWakeWordDetected: text => this.session.sendWakeWordDetected(text),
      }
    }
    return this.pluginCommands
  }
}

export function createServiceContainer(): ServiceContainer {
  return ServiceContainer.create()
}

export function getServiceContainer(): ServiceContainer {
  if (!_serviceContainer) {
    throw new Error(
      'ServiceContainer not initialized. Call createServiceContainer() during app bootstrap before getServiceContainer().',
    )
  }
  return _serviceContainer
}
