import type { AppStateSnapshot, DeviceState, ListeningMode } from '@shared/types'
import type { Buffer } from 'node:buffer'
import type { ProtocolDelegate } from '../core'
import type { Protocol } from '../protocols/Protocol'
import type { JsonMessage } from '../types/protocol'
import { DeviceStateValue, ListeningModeValue } from '@shared/types'
import { Events, ServiceContainer } from '../core'
import { getAudioConfig } from '../ipc/audioIpc'
import { AudioPlugin } from '../plugins/AudioPlugin'
import { ChatPlugin } from '../plugins/ChatPlugin'
import { Live2DPlugin } from '../plugins/Live2DPlugin'
import { McpPlugin } from '../plugins/McpPlugin'
import { PluginManager } from '../plugins/PluginManager'
import { UIPlugin } from '../plugins/UIPlugin'
import { WakeWordPlugin } from '../plugins/WakeWordPlugin'
import { MqttProtocol } from '../protocols/MqttProtocol'
import { AbortReason } from '../protocols/Protocol'
import { WebSocketProtocol } from '../protocols/WebSocketProtocol'
import { isTtsMessage } from '../types/protocol'
import { getLogger } from '../utils/logger'
import { DatabaseManager } from './database'
import { ShortcutManager } from './ShortcutManager'

/**
 * Application 编排层
 *
 * 职责：
 * - 协议初始化和连接编排
 * - 插件启动编排
 * - 对外暴露公共 API（供 IPC 和 index.ts 使用）
 *
 * 业务逻辑委托给核心模块：
 * - 状态管理 -> StateManager
 * - 任务追踪 -> TaskManager
 * - 资源释放 -> ResourcePool
 * - 事件广播 -> EventBus
 */
export class Application {
  private static instance: Application | null = null
  private logger = getLogger('Application')

  private container: ServiceContainer
  private protocol: Protocol | null = null
  private plugins = new PluginManager()
  private audioPlugin: AudioPlugin | null = null
  private wakeWordPlugin: WakeWordPlugin | null = null
  private shortcutManager: ShortcutManager | null = null
  private connectLock: Promise<boolean> | null = null
  private running: boolean = false

  private constructor() {
    this.logger.info('初始化应用实例')
    this.container = new ServiceContainer()
  }

  static getInstance(): Application {
    if (!Application.instance) {
      Application.instance = new Application()
    }
    return Application.instance
  }

  /**
   * 初始化应用
   */
  async initialize(protocolType: 'websocket' | 'mqtt' = 'mqtt'): Promise<void> {
    this.logger.info(`初始化，协议类型: ${protocolType}`)

    // 初始化协议
    this.protocol = protocolType === 'mqtt' ? new MqttProtocol() : new WebSocketProtocol()
    this.setupProtocolCallbacks()

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

    // 创建协议委托
    const delegate = this.createProtocolDelegate()

    // 初始化插件（拓扑排序 + 依赖注入）
    const ctx = this.container.createPluginContext(delegate)
    const cmd = this.container.createPluginCommands(delegate)
    await this.plugins.setupAll(ctx, cmd)

    // 初始化快捷键
    const db = DatabaseManager.getInstance()
    this.shortcutManager = new ShortcutManager(db, this)
    await this.shortcutManager.registerAll()

    // 注册资源到资源池（逆序释放）
    this.container.resourcePool.register('shortcutManager', () => {
      this.shortcutManager?.destroy()
      this.shortcutManager = null
    })
    this.container.resourcePool.register('plugins', async () => {
      await this.plugins.stopAll()
      await this.plugins.shutdownAll()
    })
    this.container.resourcePool.register('protocol', async () => {
      if (this.protocol) {
        await this.protocol.closeAudioChannel()
        this.protocol = null
      }
    })
    this.container.resourcePool.register('tasks', async () => {
      await this.container.taskManager.cancelAll(3000)
    })
    this.container.resourcePool.register('eventBus', () => {
      this.container.eventBus.clear()
    })

    this.logger.info('初始化完成')
  }

  /**
   * 启动应用
   */
  async start(): Promise<void> {
    this.logger.info('启动应用')
    this.running = true
    await this.plugins.startAll()
    // 广播初始状态
    await this.container.stateManager.setDeviceState(this.container.stateManager.getDeviceState())
    this.logger.info('应用启动完成')
  }

  /**
   * 关闭应用
   */
  async shutdown(): Promise<void> {
    if (!this.running) {
      return
    }
    this.running = false
    this.logger.info('正在关闭应用...')
    await this.container.shutdown()
    this.audioPlugin = null
    this.wakeWordPlugin = null
    this.logger.info('应用关闭完成')
  }

  // ========== 协议编排 ==========

  private setupProtocolCallbacks(): void {
    if (!this.protocol)
      return

    this.protocol.onNetworkError((error) => {
      this.logger.error('网络错误:', error)
      this.container.stateManager.setKeepListening(false)
      this.container.stateManager.setDeviceState(DeviceStateValue.IDLE).catch((err) => {
        this.logger.error('重置设备状态失败:', err)
      })
      this.container.eventBus.emit(Events.NETWORK_ERROR, error).catch(() => {})
    })

    this.protocol.onIncomingJson((data) => {
      this.container.taskManager.spawn(
        this.handleIncomingJson(data),
        'handle:json',
      ).catch(() => {})
    })

    this.protocol.onIncomingAudio((data) => {
      this.container.eventBus.emit(Events.INCOMING_AUDIO, data).catch(() => {})
    })

    this.protocol.onAudioChannelOpened(async () => {
      this.logger.info('音频通道已打开')
      await this.container.eventBus.emit(Events.AUDIO_CHANNEL_OPENED)
      await this.container.stateManager.setDeviceState(DeviceStateValue.LISTENING)
    })

    this.protocol.onAudioChannelClosed(async () => {
      this.logger.info('音频通道已关闭')
      await this.container.eventBus.emit(Events.AUDIO_CHANNEL_CLOSED)
      await this.container.stateManager.setDeviceState(DeviceStateValue.IDLE)
    })
  }

  /**
   * 处理接收到的 JSON 消息（状态管理 + 事件广播）
   */
  private async handleIncomingJson(jsonData: JsonMessage): Promise<void> {
    try {
      this.logger.info(`收到 JSON 消息: type=${jsonData.type}`, jsonData)

      // 处理 TTS 消息的状态转换
      if (isTtsMessage(jsonData)) {
        const { state } = jsonData
        const sm = this.container.stateManager

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
      await this.container.eventBus.emit(Events.INCOMING_JSON, jsonData)
    }
    catch (error) {
      this.logger.error('处理 JSON 消息失败:', error)
    }
  }

  private async restartListening(): Promise<void> {
    const sm = this.container.stateManager
    const needSendStartListening = sm.getListeningMode() !== ListeningModeValue.REALTIME
    await sm.setDeviceState(DeviceStateValue.LISTENING)
    if (needSendStartListening) {
      await this.protocol?.sendStartListening(sm.getListeningMode())
    }
  }

  /**
   * 连接协议
   */
  async connectProtocol(): Promise<boolean> {
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
            this.logger.error('协议连接失败')
            return false
          }
          this.logger.info('协议连接已建立')
          await this.container.eventBus.emit(Events.PROTOCOL_CONNECTED, this.protocol)
          return true
        }
        catch (error) {
          this.logger.error('连接协议时出错:', error)
          return false
        }
        finally {
          this.connectLock = null
        }
      })()
    }

    return await this.connectLock
  }

  // ========== 公共 API（兼容 IPC / index.ts） ==========

  async startListeningManual(): Promise<void> {
    const sm = this.container.stateManager
    const ok = await this.connectProtocol()
    if (!ok)
      return
    sm.setListeningMode(ListeningModeValue.MANUAL)
    sm.setKeepListening(false)
    if (sm.isSpeaking()) {
      await this.protocol?.sendAbortSpeaking(AbortReason.USER_INTERRUPTED)
      await sm.setDeviceState(DeviceStateValue.IDLE)
    }
    await this.protocol?.sendStartListening(ListeningModeValue.MANUAL)
    await sm.setDeviceState(DeviceStateValue.LISTENING)
  }

  async stopListeningManual(): Promise<void> {
    if (!this.protocol)
      return
    await this.protocol.sendStopListening()
    await this.container.stateManager.setDeviceState(DeviceStateValue.IDLE)
  }

  async startAutoConversation(): Promise<void> {
    const sm = this.container.stateManager
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
    await this.protocol?.sendStartListening(mode)
    await sm.setDeviceState(DeviceStateValue.LISTENING)
  }

  async stopAutoConversation(): Promise<void> {
    const sm = this.container.stateManager
    sm.setKeepListening(false)
    if (sm.isSpeaking()) {
      await this.protocol?.sendAbortSpeaking(AbortReason.USER_INTERRUPTED)
    }
    await this.protocol?.sendStopListening()
    if (this.protocol) {
      await this.protocol.closeAudioChannel()
    }
    await sm.setDeviceState(DeviceStateValue.IDLE)
  }

  async abortSpeaking(reason: AbortReason): Promise<void> {
    const sm = this.container.stateManager
    if (sm.isAborted())
      return
    sm.setAborted(true)
    await this.protocol?.sendAbortSpeaking(reason)
    await sm.setDeviceState(DeviceStateValue.IDLE)
  }

  async sendText(text: string): Promise<void> {
    const sm = this.container.stateManager
    if (sm.isSpeaking()) {
      await this.abortSpeaking(AbortReason.USER_INTERRUPTED)
    }
    const ok = await this.connectProtocol()
    if (!ok)
      return
    await this.protocol?.sendWakeWordDetected(text)
  }

  async sendWakeWordDetected(text: string): Promise<void> {
    const ok = await this.connectProtocol()
    if (!ok)
      return
    await this.protocol?.sendWakeWordDetected(text)
  }

  async interruptSpeaking(): Promise<void> {
    if (this.container.stateManager.isSpeaking()) {
      await this.stopAutoConversation()
    }
  }

  // ========== 只读访问器 ==========

  getDeviceState(): DeviceState { return this.container.stateManager.getDeviceState() }
  getProtocol(): Protocol | null { return this.protocol }
  isAudioChannelOpened(): boolean { return this.protocol?.isAudioChannelOpened() ?? false }
  getPluginManager(): PluginManager { return this.plugins }
  getAudioPlugin(): AudioPlugin | null { return this.audioPlugin }
  getWakeWordPlugin(): WakeWordPlugin | null { return this.wakeWordPlugin }
  getShortcutManager(): ShortcutManager | null { return this.shortcutManager }

  shouldCaptureAudio(): boolean {
    return this.container.stateManager.shouldCaptureAudio()
  }

  getStateSnapshot(): AppStateSnapshot {
    return {
      ...this.container.stateManager.getSnapshot(),
      channelOpen: this.isAudioChannelOpened(),
    }
  }

  reloadProtocolConfig(): void {
    if (!this.protocol)
      return
    if ('reloadConfig' in this.protocol && typeof this.protocol.reloadConfig === 'function') {
      this.protocol.reloadConfig()
    }
  }

  // ========== 协议委托工厂 ==========

  private createProtocolDelegate(): ProtocolDelegate {
    return {
      isAudioChannelOpened: () => this.protocol?.isAudioChannelOpened() ?? false,
      sendAudio: async (data: Buffer) => {
        if (this.protocol && this.protocol.isAudioChannelOpened()) {
          await this.protocol.sendAudio(data)
        }
      },
      sendText: async (text: string) => {
        await this.sendText(text)
      },
      connectProtocol: () => this.connectProtocol(),
      startListening: (mode: ListeningMode) => this.startListeningInternal(mode),
      stopListening: () => this.stopListeningManual(),
      abortSpeaking: (reason: string) => this.abortSpeaking(reason as AbortReason),
    }
  }

  /**
   * 内部监听启动（供 PluginCommands 使用）
   */
  private async startListeningInternal(mode: ListeningMode): Promise<void> {
    if (mode === ListeningModeValue.MANUAL) {
      await this.startListeningManual()
    }
    else {
      await this.startAutoConversation()
    }
  }
}

/**
 * 获取应用单例
 */
export function getApplication(): Application {
  return Application.getInstance()
}
