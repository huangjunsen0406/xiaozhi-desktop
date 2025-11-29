import type { Buffer } from 'node:buffer'
import type { Protocol } from '../protocols/Protocol'
import type { JsonMessage } from '../types/protocol'
import path from 'node:path'
import { app } from 'electron'
import { DeviceState } from '../constants/DeviceState'
import { getAudioConfig } from '../ipc/audioIpc'
import { AudioPlugin } from '../plugins/AudioPlugin'
import { ChatPlugin } from '../plugins/ChatPlugin'
import { IoTPlugin } from '../plugins/IoTPlugin'
import { Live2DPlugin } from '../plugins/Live2DPlugin'
import { McpPlugin } from '../plugins/McpPlugin'
import { PluginManager } from '../plugins/PluginManager'
import { UIPlugin } from '../plugins/UIPlugin'
import { WakeWordPlugin } from '../plugins/WakeWordPlugin'
import { AbortReason, ListeningMode } from '../protocols/Protocol'
import { WebSocketProtocol } from '../protocols/WebSocketProtocol'
import { isAlertMessage, isTtsMessage } from '../types/protocol'
import { ShortcutManager } from './ShortcutManager'
/**
 * 应用核心类 (单例模式)
 * 负责协调协议通信、插件管理和设备状态
 */
export class Application {
  private static instance: Application | null = null

  // 状态
  private running: boolean = false
  private protocol: Protocol | null = null
  private deviceState: DeviceState = DeviceState.IDLE
  private listeningMode: ListeningMode = ListeningMode.MANUAL
  private keepListening: boolean = false
  private aborted: boolean = false

  // 插件系统
  private plugins = new PluginManager()
  private audioPlugin: AudioPlugin | null = null
  private wakeWordPlugin: WakeWordPlugin | null = null

  // 快捷键管理器
  private shortcutManager: ShortcutManager | null = null

  // 锁（用于并发控制）
  private connectLock: Promise<boolean> | null = null
  private stateChangeLock: Promise<void> | null = null
  private isShuttingDown: boolean = false

  // 任务管理（用于追踪和优雅关闭）
  private activeTasks: Map<string, Promise<unknown>> = new Map()
  private taskIdCounter: number = 0

  private constructor() {
    console.log('[Application] 初始化应用实例')
  }

  /**
   * 获取单例实例
   */
  static getInstance(): Application {
    if (!Application.instance) {
      Application.instance = new Application()
    }
    return Application.instance
  }

  // ========== 任务管理 ==========

  /**
   * 派发异步任务并追踪
   *
   * 功能：
   * 1. 防止 shutdown 后创建新任务
   * 2. 追踪活跃任务（调试用）
   * 3. shutdown 时等待重要任务完成
   *
   * @param promise - 要执行的 Promise
   * @param name - 任务名称（用于日志和调试）
   * @returns 原始 Promise（如果 shutdown 中则返回 resolved Promise）
   */
  spawn<T>(promise: Promise<T>, name: string): Promise<T> {
    if (this.isShuttingDown || !this.running) {
      return Promise.resolve(undefined as T)
    }

    const taskId = `${name}:${++this.taskIdCounter}`
    const trackedPromise = promise
      .catch((error) => {
        console.error(`[Application] 任务 ${taskId} 异常:`, error)
        throw error
      })
      .finally(() => {
        this.activeTasks.delete(taskId)
      })

    this.activeTasks.set(taskId, trackedPromise)
    return trackedPromise as Promise<T>
  }

  /**
   * 等待所有活跃任务完成（用于优雅关闭）
   * @param timeout - 超时时间（毫秒），默认 5000ms
   */
  private async waitForTasks(timeout: number = 5000): Promise<void> {
    if (this.activeTasks.size === 0) {
      return
    }

    console.log(`[Application] 等待 ${this.activeTasks.size} 个任务完成...`)

    const taskNames = Array.from(this.activeTasks.keys())
    console.log(`[Application] 活跃任务: ${taskNames.join(', ')}`)

    // 创建超时 Promise
    const timeoutPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        if (this.activeTasks.size > 0) {
          console.warn(`[Application] 等待任务超时，${this.activeTasks.size} 个任务未完成`)
        }
        resolve()
      }, timeout)
    })

    // 等待所有任务完成或超时
    await Promise.race([
      Promise.allSettled(this.activeTasks.values()),
      timeoutPromise,
    ])

    // 清理剩余任务引用
    this.activeTasks.clear()
  }

  // ========== 生命周期 ==========

  /**
   * 初始化应用
   * @param protocolType - 协议类型 (websocket | mqtt)
   */
  async initialize(protocolType: 'websocket' | 'mqtt' = 'websocket'): Promise<void> {
    console.log(`[Application] 初始化，协议类型: ${protocolType}`)

    // 设置协议
    this.setProtocol(protocolType)

    // 设置协议回调
    this.setupProtocolCallbacks()

    // 注册插件（按优先级顺序）
    this.audioPlugin = new AudioPlugin()
    this.wakeWordPlugin = new WakeWordPlugin()

    this.plugins.register(
      this.audioPlugin,
      new Live2DPlugin(),
      new McpPlugin(),
      new ChatPlugin(),
      new IoTPlugin(),
      this.wakeWordPlugin,
      new UIPlugin(),
    )

    // 初始化插件
    await this.plugins.setupAll(this)

    // 初始化快捷键管理器
    const dbPath = path.join(app.getPath('userData'), 'xiaozhi.db')
    this.shortcutManager = new ShortcutManager(dbPath, this)
    await this.shortcutManager.registerAll()

    console.log('[Application] 初始化完成')
  }

  /**
   * 启动应用
   */
  async start(): Promise<void> {
    console.log('[Application] 启动应用')
    this.running = true

    // 启动所有插件
    await this.plugins.startAll()

    // 广播初始设备状态
    await this.plugins.notifyDeviceStateChanged(this.deviceState)

    console.log('[Application] 应用启动完成')
  }

  /**
   * 设置协议类型
   */
  private setProtocol(protocolType: 'websocket' | 'mqtt'): void {
    console.log(`[Application] 设置协议: ${protocolType}`)
    if (protocolType === 'mqtt') {
      // TODO: 实现 MQTT 协议
      throw new Error('MQTT 协议尚未实现')
    }
    else {
      this.protocol = new WebSocketProtocol()
    }
  }

  /**
   * 设置协议回调
   */
  private setupProtocolCallbacks(): void {
    if (!this.protocol) {
      return
    }

    this.protocol.onNetworkError((error) => {
      this.handleNetworkError(error)
    })

    this.protocol.onIncomingJson((data) => {
      // 使用 spawn 追踪任务，不阻塞协议层
      this.spawn(
        this.handleIncomingJson(data),
        'handle:json',
      ).catch(() => {
        // spawn 内部已记录错误，这里静默处理
      })
    })

    this.protocol.onIncomingAudio((data) => {
      this.handleIncomingAudio(data)
    })

    this.protocol.onAudioChannelOpened(async () => {
      await this.handleAudioChannelOpened()
    })

    this.protocol.onAudioChannelClosed(async () => {
      await this.handleAudioChannelClosed()
    })
  }

  /**
   * 连接协议
   */
  async connectProtocol(): Promise<boolean> {
    if (!this.protocol) {
      console.error('[Application] 协议未初始化')
      return false
    }

    // 已经打开
    if (this.protocol.isAudioChannelOpened()) {
      return true
    }

    // 使用锁避免并发连接（原子性检查和赋值）
    if (!this.connectLock) {
      this.connectLock = (async () => {
        try {
          // 再次检查（可能在等待锁期间已连接）
          if (this.protocol!.isAudioChannelOpened()) {
            return true
          }

          const opened = await this.protocol!.openAudioChannel()
          if (!opened) {
            console.error('[Application] 协议连接失败')
            return false
          }

          console.log('[Application] 协议连接已建立')
          await this.plugins.notifyProtocolConnected(this.protocol!)
          return true
        }
        catch (error) {
          console.error('[Application] 连接协议时出错:', error)
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
   * 开始手动监听（按住说话）
   */
  async startListeningManual(): Promise<void> {
    try {
      const ok = await this.connectProtocol()
      if (!ok) {
        return
      }

      this.listeningMode = ListeningMode.MANUAL
      this.keepListening = false

      // 如果正在说话，先发送打断
      if (this.deviceState === DeviceState.SPEAKING) {
        console.log('[Application] 说话中发送打断')
        await this.protocol!.sendAbortSpeaking(AbortReason.USER_INTERRUPTED)
        await this.setDeviceState(DeviceState.IDLE)
      }

      await this.protocol!.sendStartListening(ListeningMode.MANUAL)
      await this.setDeviceState(DeviceState.LISTENING)
    }
    catch (error) {
      console.error('[Application] 开始手动监听失败:', error)
    }
  }

  /**
   * 停止手动监听
   */
  async stopListeningManual(): Promise<void> {
    try {
      if (!this.protocol) {
        return
      }

      await this.protocol.sendStopListening()
      await this.setDeviceState(DeviceState.IDLE)
    }
    catch (error) {
      console.error('[Application] 停止手动监听失败:', error)
    }
  }

  /**
   * 开始自动对话
   * 根据用户配置选择监听模式：
   * - conversationMode = 'realtime' -> REALTIME 模式（实时对话，全双工）
   * - conversationMode = 'auto' -> AUTO_STOP 模式（回合制对话）
   */
  async startAutoConversation(): Promise<void> {
    try {
      const ok = await this.connectProtocol()
      if (!ok) {
        return
      }

      // 读取用户配置的对话模式
      const audioConfig = getAudioConfig()
      const conversationMode = audioConfig.conversationMode || 'auto'

      // 根据配置选择监听模式
      const mode = conversationMode === 'realtime'
        ? ListeningMode.REALTIME // 实时对话（全双工，可随时打断）
        : ListeningMode.AUTO_STOP // 回合制对话（半双工）

      console.log(`[Application] 启动自动对话，模式: ${conversationMode} (${mode})`)

      this.listeningMode = mode
      this.keepListening = true

      await this.protocol!.sendStartListening(mode)
      await this.setDeviceState(DeviceState.LISTENING)
    }
    catch (error) {
      console.error('[Application] 开始自动对话失败:', error)
    }
  }

  /**
   * 停止自动对话（断开连接）
   */
  async stopAutoConversation(): Promise<void> {
    try {
      console.log('[Application] 停止自动对话')
      this.keepListening = false

      // 如果正在说话，发送打断
      if (this.deviceState === DeviceState.SPEAKING) {
        await this.protocol?.sendAbortSpeaking(AbortReason.USER_INTERRUPTED)
      }

      // 停止监听
      await this.protocol?.sendStopListening()

      // 关闭音频通道
      if (this.protocol) {
        await this.protocol.closeAudioChannel()
      }

      await this.setDeviceState(DeviceState.IDLE)
    }
    catch (error) {
      console.error('[Application] 停止自动对话失败:', error)
    }
  }

  /**
   * 设置设备状态
   */
  private async setDeviceState(state: DeviceState): Promise<void> {
    // 等待之前的状态变更完成
    if (this.stateChangeLock) {
      await this.stateChangeLock
    }

    // 再次检查（可能在等待期间已变更）
    if (this.deviceState === state) {
      return
    }

    this.stateChangeLock = (async () => {
      try {
        console.log(`[Application] 设备状态变更: ${this.deviceState} -> ${state}`)
        this.deviceState = state

        // 如果进入监听状态，立即重置中止标志（在广播之前）
        if (state === DeviceState.LISTENING) {
          this.aborted = false
        }

        // 广播状态变化
        await this.plugins.notifyDeviceStateChanged(state)
      }
      catch (error) {
        console.error('[Application] 广播状态变化失败:', error)
      }
      finally {
        this.stateChangeLock = null
      }
    })()

    await this.stateChangeLock
  }

  /**
   * 中止语音输出
   */
  async abortSpeaking(reason: AbortReason): Promise<void> {
    if (this.aborted) {
      console.log('[Application] 已经中止，忽略重复的中止请求')
      return
    }

    console.log(`[Application] 中止语音输出，原因: ${reason}`)
    this.aborted = true
    await this.protocol?.sendAbortSpeaking(reason)
    await this.setDeviceState(DeviceState.IDLE)
  }

  /**
   * 发送文本消息
   * 如果正在说话中，先中止语音输出
   * 然后发送文本作为唤醒词检测消息
   * 不保存到数据库，等待服务器返回 STT 消息后统一保存
   */
  async sendText(text: string): Promise<void> {
    try {
      console.log(`[Application] 发送文本消息: ${text}`)

      // 如果正在说话，先中止
      if (this.deviceState === DeviceState.SPEAKING) {
        console.log('[Application] 说话中，先中止语音输出')
        await this.abortSpeaking(AbortReason.USER_INTERRUPTED)
      }

      // 确保协议已连接
      const ok = await this.connectProtocol()
      if (!ok) {
        console.error('[Application] 协议未连接，无法发送文本')
        return
      }

      // 发送唤醒词检测消息（服务端会将文本作为用户输入处理）
      // 服务器会返回 STT 消息，由 ChatPlugin 统一保存
      await this.protocol!.sendWakeWordDetected(text)
      console.log('[Application] 文本消息已发送，等待服务器返回 STT')
    }
    catch (error) {
      console.error('[Application] 发送文本消息失败:', error)
    }
  }

  /**
   * 处理网络错误
   */
  private handleNetworkError(error: string): void {
    console.error('[Application] 网络错误:', error)
    this.keepListening = false
    // 通知插件
    this.plugins.notifyNetworkError(error).catch((err) => {
      console.error('[Application] 通知插件网络错误失败:', err)
    })
  }

  /**
   * 处理接收到的 JSON 消息
   * 只负责状态管理，消息存储由 ChatPlugin 处理
   */
  private async handleIncomingJson(jsonData: JsonMessage): Promise<void> {
    try {
      const msgType = jsonData.type
      console.log(`[Application] 收到 JSON 消息: type=${msgType}`, jsonData)

      if (msgType === 'error') {
        console.log(jsonData)
      }

      // 处理 Alert 消息（错误/警告）
      if (isAlertMessage(jsonData)) {
        const message = jsonData.message || '未知错误'
        const code = jsonData.code
        console.warn(`[Application] 收到服务端警告: ${message}${code ? ` (code: ${code})` : ''}`)
        console.warn('[Application] 完整 alert 消息:', JSON.stringify(jsonData, null, 2))
      }

      // 处理 TTS 消息
      if (isTtsMessage(jsonData)) {
        const { state } = jsonData

        if (state === 'start') {
          // TTS 开始：根据是否持续监听决定状态
          if (this.keepListening && this.listeningMode === ListeningMode.REALTIME) {
            await this.setDeviceState(DeviceState.LISTENING)
          }
          else {
            await this.setDeviceState(DeviceState.SPEAKING)
          }
        }
        else if (state === 'stop') {
          // TTS 结束
          if (this.keepListening) {
            // 继续对话：重启监听
            await this.restartListening()
          }
          else if (this.deviceState !== DeviceState.LISTENING) {
            // 如果当前不是监听状态，才设置为空闲
            // 避免打断后手动启动的监听被 TTS stop 关闭
            await this.setDeviceState(DeviceState.IDLE)
          }
        }
      }

      // 转发给插件（使用 spawn 追踪）
      this.spawn(
        this.plugins.notifyIncomingJson(jsonData),
        'notify:plugin:json',
      ).catch(() => {
        // spawn 内部已记录错误
      })
    }
    catch (error) {
      console.error('[Application] 处理 JSON 消息失败:', error)
    }
  }

  /**
   * 处理接收到的音频数据
   */
  private handleIncomingAudio(data: Buffer): void {
    // 音频数据是高频事件，不追踪（避免性能开销）
    // 直接转发给插件
    this.plugins.notifyIncomingAudio(data).catch((error) => {
      console.error('[Application] 通知插件音频数据失败:', error)
    })
  }

  /**
   * 处理音频通道打开
   */
  private async handleAudioChannelOpened(): Promise<void> {
    console.log('[Application] 音频通道已打开')
    await this.plugins.notifyAudioChannelOpened()
    await this.setDeviceState(DeviceState.LISTENING)
  }

  /**
   * 处理音频通道关闭
   */
  private async handleAudioChannelClosed(): Promise<void> {
    console.log('[Application] 音频通道已关闭')
    await this.plugins.notifyAudioChannelClosed()
    await this.setDeviceState(DeviceState.IDLE)
  }

  /**
   * 重启监听
   */
  private async restartListening(): Promise<void> {
    try {
      // 先设置状态为 LISTENING
      await this.setDeviceState(DeviceState.LISTENING)

      // 如果是 REALTIME 模式且已在 LISTENING，无需重复发送
      if (this.listeningMode === ListeningMode.REALTIME && this.deviceState === DeviceState.LISTENING) {
        return
      }

      // 发送监听指令
      await this.protocol?.sendStartListening(this.listeningMode)
    }
    catch (error) {
      console.error('[Application] 重启监听失败:', error)
    }
  }

  /**
   * 只读访问器：获取设备状态
   */
  getDeviceState(): DeviceState {
    return this.deviceState
  }

  /**
   * 只读访问器：获取协议实例
   */
  getProtocol(): Protocol | null {
    return this.protocol
  }

  /**
   * 只读访问器：音频通道是否打开
   */
  isAudioChannelOpened(): boolean {
    return this.protocol?.isAudioChannelOpened() ?? false
  }

  /**
   * 判断是否应该采集麦克风音频
   * - LISTENING 状态：始终采集（未被中止时）
   * - SPEAKING 状态：仅在实时模式下采集（全双工）
   */
  shouldCaptureAudio(): boolean {
    if (this.deviceState === DeviceState.LISTENING && !this.aborted) {
      return true
    }
    return (
      this.deviceState === DeviceState.SPEAKING
      && this.keepListening
      && this.listeningMode === ListeningMode.REALTIME
    )
  }

  /**
   * 获取状态快照
   */
  getStateSnapshot(): {
    device_state: DeviceState
    listening_mode: ListeningMode
    keep_listening: boolean
    audio_opened: boolean
  } {
    return {
      device_state: this.deviceState,
      listening_mode: this.listeningMode,
      keep_listening: this.keepListening,
      audio_opened: this.isAudioChannelOpened(),
    }
  }

  /**
   * 获取插件管理器
   */
  getPluginManager(): PluginManager {
    return this.plugins
  }

  /**
   * 获取 AudioPlugin 实例
   */
  getAudioPlugin(): AudioPlugin | null {
    return this.audioPlugin
  }

  /**
   * 获取 WakeWordPlugin 实例
   */
  getWakeWordPlugin(): WakeWordPlugin | null {
    return this.wakeWordPlugin
  }

  /**
   * 获取 ShortcutManager 实例
   */
  getShortcutManager(): ShortcutManager | null {
    return this.shortcutManager
  }

  /**
   * 获取当前状态（供快捷键使用）
   */
  getState(): {
    deviceState: DeviceState
    listeningMode: ListeningMode
    channelOpen: boolean
  } {
    return {
      deviceState: this.deviceState,
      listeningMode: this.listeningMode,
      channelOpen: this.isAudioChannelOpened(),
    }
  }

  /**
   * 打断说话（供快捷键使用）
   */
  async interruptSpeaking(): Promise<void> {
    if (this.deviceState === DeviceState.SPEAKING) {
      await this.stopAutoConversation()
      console.log('[Application] 已打断当前对话')
    }
    else {
      console.log('[Application] 当前不在说话状态，无需打断')
    }
  }

  /**
   * 关闭应用
   */
  async shutdown(): Promise<void> {
    if (!this.running || this.isShuttingDown) {
      return
    }

    this.isShuttingDown = true
    console.log('[Application] 正在关闭应用...')
    this.running = false

    try {
      // 等待活跃任务完成（最多等待 3 秒）
      await this.waitForTasks(3000)

      // 等待状态变更完成
      if (this.stateChangeLock) {
        await this.stateChangeLock
      }

      // 等待连接操作完成
      if (this.connectLock) {
        await this.connectLock
      }

      // 关闭协议
      if (this.protocol) {
        try {
          await this.protocol.closeAudioChannel()
        }
        catch (error) {
          console.error('[Application] 关闭协议失败:', error)
        }
        this.protocol = null
      }

      // 停止并关闭所有插件
      await this.plugins.stopAll()
      await this.plugins.shutdownAll()

      // 销毁快捷键管理器
      this.shortcutManager?.destroy()
      this.shortcutManager = null

      // 清理插件引用
      this.audioPlugin = null
      this.wakeWordPlugin = null

      // 重置状态
      this.deviceState = DeviceState.IDLE
      this.keepListening = false
      this.aborted = false

      console.log('[Application] 应用关闭完成')
    }
    catch (error) {
      console.error('[Application] 关闭应用时出错:', error)
    }
    finally {
      this.isShuttingDown = false
    }
  }
}

/**
 * 获取应用单例
 */
export function getApplication(): Application {
  return Application.getInstance()
}
