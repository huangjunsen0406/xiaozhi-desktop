/**
 * 会话控制：听/说状态机与协议发送
 *
 * 与 UI 侧按钮文案/模式分离：这里只负责 connect / listen / abort / TTS 回环
 * 等应用级会话逻辑（对齐 py-xiaozhi ConversationSession）。
 */

import type { AudioSettings, ListeningMode, ServerMessage } from '@shared/types'
import type { EventBus } from '../core/EventBus'
import type { ProtocolManager } from '../core/ProtocolManager'
import type { StateManager } from '../core/StateManager'
import type { TaskManager } from '../core/TaskManager'
import type { AbortReason } from '../protocols/Protocol'
import { DeviceStateValue, isServerTtsMessage, ListeningModeValue } from '@shared/types'
import { Events } from '../core/EventBus'
import { AbortReason as AbortReasonEnum } from '../protocols/Protocol'
import { getAudioSettings } from '../services/audioSettings'
import { getLogger } from '../utils/logger'

const logger = getLogger('ConversationSession')

/**
 * 应用级会话控制器
 */
export class ConversationSession {
  private commandTail: Promise<void> = Promise.resolve()
  /**
   * MCP 工具配置重连等：通道打开后保持 IDLE，不自动进入聆听
   */
  private keepIdleOnChannelOpen = false

  /** 解绑用的 handler 引用 */
  private unsubscribers: Array<() => void> = []

  constructor(
    private readonly state: StateManager,
    private readonly protocol: Pick<ProtocolManager, 'isAudioChannelOpened' | 'openAudioChannel' | 'closeAudioChannel' | 'sendStartListening' | 'sendStopListening' | 'sendAbort' | 'sendWakeWordDetected' | 'reloadConfig'>,
    private readonly taskManager: TaskManager,
    private readonly readAudioSettings: () => Pick<AudioSettings, 'conversationMode'> = getAudioSettings,
  ) {}

  /** 仅用户/插件控制命令排队；协议事件与音频帧不经过此队列。 */
  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = this.commandTail.then(() => this.taskManager.run(work, 'session:command'))
    this.commandTail = result.then(() => {}, () => {})
    return result
  }

  private async startCommand(work: () => Promise<void>): Promise<void> {
    try {
      await work()
    }
    catch (error) {
      this.state.setKeepListening(false)
      await this.state.setDeviceState(DeviceStateValue.IDLE)
      throw error
    }
  }

  connectProtocol(): Promise<boolean> {
    return this.enqueue(() => this.doConnectProtocol())
  }

  startListening(mode: ListeningMode): Promise<void> {
    return this.enqueue(() => this.startCommand(() => this.doStartListening(mode)))
  }

  stopListening(): Promise<void> {
    return this.enqueue(() => this.doStopListening())
  }

  startListeningManual(): Promise<void> {
    return this.enqueue(() => this.startCommand(() => this.doStartListeningManual()))
  }

  stopListeningManual(): Promise<void> {
    return this.enqueue(() => this.doStopListeningManual())
  }

  startAutoConversation(): Promise<void> {
    return this.enqueue(() => this.startCommand(() => this.doStartAutoConversation()))
  }

  stopAutoConversation(): Promise<void> {
    return this.enqueue(() => this.doStopAutoConversation())
  }

  abortSpeaking(reason: AbortReason): Promise<void> {
    return this.enqueue(() => this.doAbortSpeaking(reason))
  }

  sendText(text: string): Promise<void> {
    return this.enqueue(() => this.doSendText(text))
  }

  sendWakeWordDetected(text: string): Promise<void> {
    return this.enqueue(() => this.doSendWakeWordDetected(text))
  }

  interruptSpeaking(): Promise<void> {
    return this.enqueue(() => this.doInterruptSpeaking())
  }

  reconnectKeepingIdle(): Promise<void> {
    return this.enqueue(() => this.doReconnectKeepingIdle())
  }

  // -------------------------
  // 事件订阅
  // -------------------------

  /**
   * 订阅协议/状态相关事件（可重复调用，以最后一次为准）
   */
  bindEvents(eventBus: EventBus): void {
    this.unbindEvents()

    this.unsubscribers = [
      eventBus.on(Events.AUDIO_CHANNEL_OPENED, () =>
        this.taskManager.run(() => this.onAudioChannelOpened(), 'session:channel-opened')),
      eventBus.on(Events.AUDIO_CHANNEL_CLOSED, () =>
        this.taskManager.run(() => this.onAudioChannelClosed(), 'session:channel-closed')),
      eventBus.on(Events.INCOMING_JSON, data =>
        this.enqueue(() => this.onIncomingJson(data))),
      eventBus.on(Events.NETWORK_ERROR, error =>
        this.taskManager.run(() => this.onNetworkError(error), 'session:network-error')),
    ]
  }

  /**
   * 取消事件订阅
   */
  unbindEvents(): void {
    for (const off of this.unsubscribers) {
      try {
        off()
      }
      catch {
        // ignore
      }
    }
    this.unsubscribers = []
  }

  // -------------------------
  // 事件处理器
  // -------------------------

  private async onAudioChannelOpened(): Promise<void> {
    if (this.keepIdleOnChannelOpen) {
      this.keepIdleOnChannelOpen = false
      this.state.setKeepListening(false)
      await this.state.setDeviceState(DeviceStateValue.IDLE)
      logger.info('协议通道已打开（配置重连）：保持空闲，不进入聆听')
      return
    }
    await this.state.setDeviceState(DeviceStateValue.LISTENING)
  }

  private async onAudioChannelClosed(): Promise<void> {
    this.state.setKeepListening(false)
    await this.state.setDeviceState(DeviceStateValue.IDLE)
  }

  private async onNetworkError(_errorMessage: string): Promise<void> {
    this.state.setKeepListening(false)
    try {
      if (!this.state.isIdle()) {
        await this.state.setDeviceState(DeviceStateValue.IDLE)
      }
    }
    catch (error) {
      logger.error('网络错误后复位设备状态失败', error)
    }
  }

  /**
   * 处理 TTS 状态迁移（由 ProtocolManager 广播 INCOMING_JSON 后调用）
   */
  private async onIncomingJson(jsonData: ServerMessage): Promise<void> {
    try {
      if (!isServerTtsMessage(jsonData)) {
        return
      }

      const { state } = jsonData
      if (state === 'start') {
        await this.handleTtsStart()
      }
      else if (state === 'stop') {
        await this.handleTtsStop()
      }
    }
    catch (error) {
      logger.error('处理 TTS 消息失败', error)
    }
  }

  private async handleTtsStart(): Promise<void> {
    if (
      this.state.isKeepListening()
      && this.state.getListeningMode() === ListeningModeValue.REALTIME
    ) {
      await this.state.setDeviceState(DeviceStateValue.LISTENING)
    }
    else {
      await this.state.setDeviceState(DeviceStateValue.SPEAKING)
    }
  }

  private async handleTtsStop(): Promise<void> {
    if (!this.state.isKeepListening()) {
      if (!this.state.isListening()) {
        await this.state.setDeviceState(DeviceStateValue.IDLE)
      }
      return
    }

    // realtime 一般还在 listen 里，不用再发一遍
    if (this.state.getListeningMode() !== ListeningModeValue.REALTIME) {
      if (this.protocol.isAudioChannelOpened()) {
        try {
          await this.protocol.sendStartListening(this.state.getListeningMode())
        }
        catch (error) {
          logger.warn('TTS 结束后重新 listen 失败', error)
        }
      }
      else {
        logger.warn('TTS 结束但协议通道已关闭，跳过重新 listen')
      }
    }

    await this.state.setDeviceState(DeviceStateValue.LISTENING)
  }

  // -------------------------
  // 操作方法（公共 API）
  // -------------------------

  private async doConnectProtocol(): Promise<boolean> {
    if (this.protocol.isAudioChannelOpened()) {
      return true
    }
    return this.protocol.openAudioChannel()
  }

  /**
   * 开始监听（通用，供 PluginCommands 使用）
   */
  private async doStartListening(mode: ListeningMode): Promise<void> {
    this.state.setListeningMode(mode)
    await this.state.setDeviceState(DeviceStateValue.CONNECTING)

    // 先关闭旧连接（确保每次对话使用新 session）
    if (this.protocol.isAudioChannelOpened()) {
      await this.protocol.closeAudioChannel()
    }

    this.state.setKeepListening(
      mode === ListeningModeValue.REALTIME || mode === ListeningModeValue.AUTO,
    )
    const connected = await this.protocol.openAudioChannel()
    if (!connected) {
      throw new Error('无法连接语音服务')
    }

    await this.protocol.sendStartListening(mode)
    await this.state.setDeviceState(DeviceStateValue.LISTENING)
  }

  private async doStopListening(): Promise<void> {
    await this.doStopListeningManual()
  }

  private async doStartListeningManual(): Promise<void> {
    if (this.state.isKeepListening())
      await this.doStopAutoConversation()
    const ok = await this.doConnectProtocol()
    if (!ok) {
      throw new Error('无法连接语音服务')
    }

    this.state.setListeningMode(ListeningModeValue.MANUAL)
    this.state.setKeepListening(false)

    if (this.state.isSpeaking()) {
      await this.protocol.sendAbort(AbortReasonEnum.USER_INTERRUPTED)
      await this.state.setDeviceState(DeviceStateValue.IDLE)
    }

    await this.protocol.sendStartListening(ListeningModeValue.MANUAL)
    await this.state.setDeviceState(DeviceStateValue.LISTENING)
  }

  private async doStopListeningManual(): Promise<void> {
    this.state.setKeepListening(false)
    try {
      await this.protocol.sendStopListening()
    }
    finally {
      await this.state.setDeviceState(DeviceStateValue.IDLE)
    }
  }

  private async doStartAutoConversation(): Promise<void> {
    if (this.state.getListeningMode() === ListeningModeValue.MANUAL && this.state.isListening())
      await this.doStopListeningManual()
    if (this.state.isSpeaking())
      await this.protocol.sendAbort(AbortReasonEnum.USER_INTERRUPTED)
    // conversationMode 属于 Settings 偏好，不走 Runtime / hello
    const audioSettings = this.readAudioSettings()
    const conversationMode = audioSettings.conversationMode || 'auto'
    const mode: ListeningMode = conversationMode === 'realtime'
      ? ListeningModeValue.REALTIME
      : ListeningModeValue.AUTO

    this.state.setListeningMode(mode)
    this.state.setKeepListening(true)
    await this.state.setDeviceState(DeviceStateValue.CONNECTING)

    const ok = await this.doConnectProtocol()
    if (!ok) {
      throw new Error('无法连接语音服务')
    }

    await this.protocol.sendStartListening(mode)
    await this.state.setDeviceState(DeviceStateValue.LISTENING)
  }

  private async doStopAutoConversation(): Promise<void> {
    this.state.setKeepListening(false)
    if (this.state.isSpeaking()) {
      await this.protocol.sendAbort(AbortReasonEnum.USER_INTERRUPTED)
    }
    await this.protocol.sendStopListening()
    await this.protocol.closeAudioChannel()
    await this.state.setDeviceState(DeviceStateValue.IDLE)
  }

  private async doAbortSpeaking(reason: AbortReason): Promise<void> {
    if (this.state.isAborted()) {
      logger.debug(`已经中止，忽略重复请求: ${reason}`)
      return
    }

    logger.info(`中止语音输出: ${reason}`)
    this.state.setAborted(true)

    try {
      if (this.protocol.isAudioChannelOpened()) {
        await this.protocol.sendAbort(reason)
      }
    }
    catch (error) {
      logger.warn('发送 abort 失败', error)
    }

    if (this.state.isKeepListening()) {
      if (this.state.getListeningMode() !== ListeningModeValue.REALTIME) {
        if (this.protocol.isAudioChannelOpened()) {
          try {
            await this.protocol.sendStartListening(this.state.getListeningMode())
          }
          catch (error) {
            logger.warn('打断后重新 listen 失败', error)
          }
        }
      }
      await this.state.setDeviceState(DeviceStateValue.LISTENING)
      this.state.setAborted(false)
      logger.debug('打断后已恢复持续监听')
    }
    else {
      await this.state.setDeviceState(DeviceStateValue.IDLE)
    }
  }

  private async doSendText(text: string): Promise<void> {
    if (this.state.isKeepListening())
      await this.doStopAutoConversation()
    else if (this.state.isListening())
      await this.doStopListeningManual()
    if (this.state.isSpeaking()) {
      await this.doAbortSpeaking(AbortReasonEnum.USER_INTERRUPTED)
    }
    const ok = await this.doConnectProtocol()
    if (!ok) {
      throw new Error('无法连接语音服务')
    }
    await this.protocol.sendWakeWordDetected(text)
  }

  private async doSendWakeWordDetected(text: string): Promise<void> {
    const ok = await this.doConnectProtocol()
    if (!ok) {
      throw new Error('无法连接语音服务')
    }
    await this.protocol.sendWakeWordDetected(text)
  }

  private async doInterruptSpeaking(): Promise<void> {
    if (this.state.isSpeaking()) {
      await this.doStopAutoConversation()
    }
  }

  /**
   * 协议配置变更后重连，保持 IDLE（不自动听）
   */
  private async doReconnectKeepingIdle(): Promise<void> {
    if (!this.protocol.isAudioChannelOpened()) {
      logger.info('当前无活跃协议连接，跳过重连')
      return
    }

    logger.info('触发协议重连（保持空闲）...')
    this.state.setKeepListening(false)
    this.keepIdleOnChannelOpen = true

    try {
      this.protocol.reloadConfig()
      await this.protocol.closeAudioChannel()
      const ok = await this.doConnectProtocol()
      if (ok) {
        if (!this.state.isIdle()) {
          await this.state.setDeviceState(DeviceStateValue.IDLE)
        }
        logger.info('协议重连完成（保持空闲）')
      }
      else {
        this.keepIdleOnChannelOpen = false
        logger.warn('协议重连失败')
      }
    }
    catch (error) {
      this.keepIdleOnChannelOpen = false
      logger.error('协议重连失败', error)
      throw error
    }
  }
}
