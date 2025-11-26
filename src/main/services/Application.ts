import type { Protocol } from '../protocols/Protocol'
import type { JsonMessage } from '../types/protocol'
import { Buffer } from 'node:buffer'
import path from 'node:path'
import { app } from 'electron'
import { DeviceState } from '../constants/DeviceState'
import { getAudioConfig } from '../ipc/audioIpc'
import { AudioPlugin } from '../plugins/AudioPlugin'
import { McpPlugin } from '../plugins/McpPlugin'
import { PluginManager } from '../plugins/PluginManager'
import { UIPlugin } from '../plugins/UIPlugin'
import { WakeWordPlugin } from '../plugins/WakeWordPlugin'
import { AbortReason, ListeningMode } from '../protocols/Protocol'
import { WebSocketProtocol } from '../protocols/WebSocketProtocol'
import { DatabaseManager } from './database'
import { ShortcutManager } from './ShortcutManager'
/**
 * 应用核心类 (单例模式)
 * 负责协调协议通信、插件管理和设备状态
 */
export class Application {
  private static instance: Application | null = null
  private static initializationLock = false

  // 配置（暂未使用，后续可用于读取 AEC 等设置）
  // private config = getConfigManager()

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
  private uiPlugin: UIPlugin | null = null
  private mcpPlugin: McpPlugin | null = null

  // 快捷键管理器
  private shortcutManager: ShortcutManager | null = null

  // 锁（用于并发控制）
  private connectLock: Promise<boolean> | null = null

  // 会话管理（按天）
  private currentSessionId: string = ''

  // 消息累积器（用于 TTS 流式内容）
  private messageAccumulator = {
    ttsContent: '',
    currentEmotion: '',
    pendingImageData: null as { type: string, data: string } | null,
  }

  // 记录最近一次通过 sendText 发送的文本（用于避免 STT 重复保存）
  private lastSentText: string | null = null

  private constructor() {
    console.log('[Application] 初始化应用实例')
  }

  /**
   * 获取单例实例
   */
  static getInstance(): Application {
    if (!Application.instance) {
      if (Application.initializationLock) {
        throw new Error('Application 正在初始化中')
      }
      Application.initializationLock = true
      Application.instance = new Application()
      Application.initializationLock = false
    }
    return Application.instance
  }

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

    // 注册插件
    this.audioPlugin = new AudioPlugin()
    this.plugins.register(this.audioPlugin)

    this.wakeWordPlugin = new WakeWordPlugin()
    this.plugins.register(this.wakeWordPlugin)

    this.uiPlugin = new UIPlugin()
    this.plugins.register(this.uiPlugin)

    this.mcpPlugin = new McpPlugin()
    this.plugins.register(this.mcpPlugin)

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

    // 初始化会话（获取或创建今天的会话）
    this.currentSessionId = this.getTodaySessionId()
    await this.ensureSessionExists(this.currentSessionId)
    console.log(`[Application] 当前会话: ${this.currentSessionId}`)

    // 广播初始设备状态
    await this.plugins.notifyDeviceStateChanged(this.deviceState)

    console.log('[Application] 应用启动完成')
  }

  /**
   * 获取今天的会话 ID
   * 格式：chat_YYYYMMDD
   */
  private getTodaySessionId(): string {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `chat_${year}${month}${day}`
  }

  /**
   * 确保会话存在（不存在则创建）
   */
  private async ensureSessionExists(sessionId: string): Promise<void> {
    const db = DatabaseManager.getInstance()

    // 检查会话是否已存在
    const existingSession = db.getChatSession(sessionId)
    if (existingSession) {
      console.log(`[Application] 会话已存在: ${sessionId}`)
      return
    }

    // 创建新会话
    const now = Math.floor(Date.now() / 1000)
    db.createChatSession({
      session_id: sessionId,
      title: this.formatSessionTitle(sessionId),
      started_at: now,
    })

    console.log(`[Application] 已创建新会话: ${sessionId}`)
  }

  /**
   * 格式化会话标题
   * chat_20250125 → "2025年01月25日"
   */
  private formatSessionTitle(sessionId: string): string {
    const dateStr = sessionId.replace('chat_', '')
    const year = dateStr.substring(0, 4)
    const month = dateStr.substring(4, 6)
    const day = dateStr.substring(6, 8)

    return `${year}年${month}月${day}日`
  }

  /**
   * 检查是否需要切换到新的一天的会话
   * （用于应用长时间运行跨天的情况）
   */
  private async checkAndSwitchSession(): Promise<void> {
    const todaySessionId = this.getTodaySessionId()

    if (todaySessionId !== this.currentSessionId) {
      console.log(`[Application] 检测到日期变化，切换会话: ${this.currentSessionId} → ${todaySessionId}`)
      this.currentSessionId = todaySessionId
      await this.ensureSessionExists(todaySessionId)
    }
  }

  /**
   * 获取当前会话 ID
   */
  getCurrentSessionId(): string {
    return this.currentSessionId
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
      this.handleIncomingJson(data)
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

    // 使用锁避免并发连接
    if (this.connectLock) {
      return await this.connectLock
    }

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
    if (this.deviceState === state) {
      return
    }

    console.log(`[Application] 设备状态变更: ${this.deviceState} -> ${state}`)
    this.deviceState = state

    // 如果进入监听状态，立即重置中止标志（在广播之前）
    if (state === DeviceState.LISTENING) {
      this.aborted = false
    }

    // 广播状态变化
    try {
      await this.plugins.notifyDeviceStateChanged(state)
    }
    catch (error) {
      console.error('[Application] 广播状态变化失败:', error)
    }
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

      // ⭐ 保存用户文本消息
      try {
        await this.checkAndSwitchSession()
        const db = DatabaseManager.getInstance()
        const result = db.addChatMessage({
          session_id: this.currentSessionId,
          role: 'user',
          content: text,
          source_type: 'text',
          timestamp: Math.floor(Date.now() / 1000),
        })
        console.log(`[Application] 已保存用户文本消息 [${result.id}]`)
        this.uiPlugin?.broadcastMessageAdded(result.id, this.currentSessionId, 'user')
      }
      catch (error) {
        console.error('[Application] 保存用户文本消息失败:', error)
      }

      // 记录发送的文本，用于避免 STT 重复保存
      this.lastSentText = text

      // 发送唤醒词检测消息（服务端会将文本作为用户输入处理）
      await this.protocol!.sendWakeWordDetected(text)
      console.log('[Application] 文本消息已发送')
    }
    catch (error) {
      console.error('[Application] 发送文本消息失败:', error)
      this.lastSentText = null
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
   */
  private async handleIncomingJson(jsonData: JsonMessage): Promise<void> {
    try {
      const msgType = jsonData.type
      console.log(`[Application] 收到 JSON 消息: type=${msgType}`, jsonData)

      if (msgType === 'error') {
        console.log(jsonData)
      }

      // 处理 Alert 消息（错误/警告）
      if (msgType === 'alert') {
        const message = (jsonData as { message?: string }).message || '未知错误'
        const code = (jsonData as { code?: string }).code
        console.warn(`[Application] 收到服务端警告: ${message}${code ? ` (code: ${code})` : ''}`)
        console.warn('[Application] 完整 alert 消息:', JSON.stringify(jsonData, null, 2))
      }

      // ⭐ 保存 STT 消息
      if (msgType === 'stt' && jsonData.text) {
        await this.saveSttMessage(String(jsonData.text))
      }

      // 处理 TTS 消息（状态管理 + 内容累积）
      if (msgType === 'tts') {
        const state = (jsonData as { state?: string }).state

        // 流式内容累积
        await this.handleTtsMessage(jsonData)

        // 状态管理
        if (state === 'start') {
          // TTS 开始：根据是否持续监听决定状态
          if (this.keepListening && this.listeningMode === ListeningMode.REALTIME) {
            this.setDeviceState(DeviceState.LISTENING)
          }
          else {
            this.setDeviceState(DeviceState.SPEAKING)
          }
        }
        else if (state === 'stop') {
          // TTS 结束
          if (this.keepListening) {
            // 继续对话：重启监听
            this.restartListening()
          }
          else if (this.deviceState !== DeviceState.LISTENING) {
            // 如果当前不是监听状态，才设置为空闲
            // 避免打断后手动启动的监听被 TTS stop 关闭
            this.setDeviceState(DeviceState.IDLE)
          }
        }
      }

      // ⭐ 缓存图片数据
      if (msgType === 'image' && (jsonData as { image_data?: string }).image_data) {
        this.messageAccumulator.pendingImageData = {
          type: (jsonData as { image_type?: string }).image_type || 'screenshot',
          data: (jsonData as { image_data?: string }).image_data!,
        }
        console.log('[Application] 已缓存图片数据')
      }

      // ⭐ 跟踪情感
      if ((jsonData as { emotion?: string }).emotion) {
        this.messageAccumulator.currentEmotion = (jsonData as { emotion?: string }).emotion!
      }

      // 转发给插件
      this.plugins.notifyIncomingJson(jsonData).catch((error) => {
        console.error('[Application] 通知插件 JSON 消息失败:', error)
      })
    }
    catch (error) {
      console.error('[Application] 处理 JSON 消息失败:', error)
    }
  }

  /**
   * 保存 STT 消息
   */
  private async saveSttMessage(text: string): Promise<void> {
    try {
      // 过滤掉音频触发工具的提示消息（用户真实文本已在 sendTextViaAudio 中保存）
      if (text === '获取用户输入文本。') {
        console.log('[Application] 过滤掉工具触发提示消息，跳过保存')
        return
      }

      // 过滤掉 sendText 发送后服务端返回的 STT 消息（用户文本已在 sendText 中保存）
      if (this.lastSentText && text === this.lastSentText) {
        console.log('[Application] 过滤掉 sendText 返回的 STT 消息，跳过保存')
        this.lastSentText = null // 清空标记
        return
      }

      // 确保使用今天的会话
      await this.checkAndSwitchSession()

      const db = DatabaseManager.getInstance()
      const result = db.addChatMessage({
        session_id: this.currentSessionId,
        role: 'user',
        content: text,
        source_type: 'voice',
        timestamp: Math.floor(Date.now() / 1000),
      })

      console.log(`[Application] 已保存 STT 消息 [${result.id}]: ${text.substring(0, 30)}...`)

      // 广播消息保存事件
      this.uiPlugin?.broadcastMessageAdded(result.id, this.currentSessionId, 'user')
    }
    catch (error) {
      console.error('[Application] 保存 STT 消息失败:', error)
    }
  }

  /**
   * 处理 TTS 消息（流式累积）
   */
  private async handleTtsMessage(message: JsonMessage): Promise<void> {
    const state = (message as { state?: string }).state
    const text = (message as { text?: string }).text

    if (state === 'start') {
      // TTS 开始，重置累积器
      this.messageAccumulator.ttsContent = ''
      console.log('[Application] TTS 开始，重置累积器')
    }
    else if (state === 'sentence_end' && text) {
      // 句子播放完成，累积内容（换行分隔）
      if (this.messageAccumulator.ttsContent) {
        this.messageAccumulator.ttsContent += `\n${text}`
      }
      else {
        this.messageAccumulator.ttsContent = text
      }
    }
    else if (state === 'stop') {
      // TTS 结束，保存完整回复
      console.log('[Application] TTS 结束，准备保存')
      await this.saveTtsReply()
    }
  }

  /**
   * 保存 TTS 完整回复
   */
  private async saveTtsReply(): Promise<void> {
    try {
      // 确保使用今天的会话
      await this.checkAndSwitchSession()

      const db = DatabaseManager.getInstance()
      const savedMessageIds: number[] = []

      // 1. 保存图片（如果有）
      if (this.messageAccumulator.pendingImageData) {
        const imageResult = db.addChatMessage({
          session_id: this.currentSessionId,
          role: 'assistant',
          content: '[图片]',
          source_type: 'image',
          image_data: Buffer.from(this.messageAccumulator.pendingImageData.data, 'base64'),
          timestamp: Math.floor(Date.now() / 1000) - 1, // 图片时间稍早
        })
        savedMessageIds.push(imageResult.id)
        console.log(`[Application] 已保存图片消息 [${imageResult.id}]`)
      }

      // 2. 保存文本内容
      if (this.messageAccumulator.ttsContent.trim()) {
        const textResult = db.addChatMessage({
          session_id: this.currentSessionId,
          role: 'assistant',
          content: this.messageAccumulator.ttsContent.trim(),
          emotion: this.messageAccumulator.currentEmotion || undefined,
          source_type: 'tts',
          timestamp: Math.floor(Date.now() / 1000),
        })
        savedMessageIds.push(textResult.id)
        console.log(`[Application] 已保存 TTS 消息 [${textResult.id}]: ${
          this.messageAccumulator.ttsContent.substring(0, 30)
        }...`)
      }

      // 3. 广播消息保存事件
      if (savedMessageIds.length > 0) {
        this.uiPlugin?.broadcastMessagesBatchAdded(savedMessageIds, this.currentSessionId)
      }

      // 4. 重置累积器
      this.resetMessageAccumulator()
    }
    catch (error) {
      console.error('[Application] 保存 TTS 回复失败:', error)
    }
  }

  /**
   * 重置消息累积器
   */
  private resetMessageAccumulator(): void {
    this.messageAccumulator.ttsContent = ''
    this.messageAccumulator.currentEmotion = ''
    this.messageAccumulator.pendingImageData = null
  }

  /**
   * 处理接收到的音频数据
   */
  private handleIncomingAudio(data: Buffer): void {
    // console.log(`[Application] 收到音频数据，长度: ${data.length}`)

    // 转发给插件
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
   * 只读访问器：是否空闲
   */
  isIdle(): boolean {
    return this.deviceState === DeviceState.IDLE
  }

  /**
   * 只读访问器：是否监听中
   */
  isListening(): boolean {
    return this.deviceState === DeviceState.LISTENING
  }

  /**
   * 只读访问器：是否说话中
   */
  isSpeaking(): boolean {
    return this.deviceState === DeviceState.SPEAKING
  }

  /**
   * 只读访问器：是否持续监听
   */
  isKeepListening(): boolean {
    return this.keepListening
  }

  /**
   * 只读访问器：音频通道是否打开
   */
  isAudioChannelOpened(): boolean {
    try {
      return this.protocol?.isAudioChannelOpened() || false
    }
    catch {
      return false
    }
  }

  /**
   * 判断是否应该采集麦克风音频
   *
   * 采集规则：
   * 1. LISTENING 状态：始终采集（未被中止时）
   * 2. SPEAKING 状态：仅在实时模式下采集
   *    - 需要同时满足：keepListening = true 且 listeningMode = REALTIME
   */
  shouldCaptureAudio(): boolean {
    try {
      // LISTENING 状态：始终采集（未被中止时）
      if (this.deviceState === DeviceState.LISTENING && !this.aborted) {
        return true
      }

      // SPEAKING 状态：仅在实时模式下采集（全双工）
      return (
        this.deviceState === DeviceState.SPEAKING
        && this.keepListening
        && this.listeningMode === ListeningMode.REALTIME
      )
    }
    catch {
      return false
    }
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
  interruptSpeaking(): void {
    if (this.deviceState === DeviceState.SPEAKING) {
      this.stopAutoConversation()
      console.log('[Application] 已打断当前对话')
    }
    else {
      console.log('[Application] 当前不在说话状态，无需打断')
    }
  }

  /**
   * 保存图片到数据库（供工具调用）
   * @param imageBase64 - base64 编码的图片数据
   * @param sourceType - 图片来源类型
   */
  async saveImage(imageBase64: string, sourceType: 'screenshot' | 'camera'): Promise<void> {
    try {
      console.log(`[Application] 保存 ${sourceType} 图片到数据库`)

      // 确保使用今天的会话
      await this.checkAndSwitchSession()

      const db = DatabaseManager.getInstance()
      const result = db.addChatMessage({
        session_id: this.currentSessionId,
        role: 'assistant',
        content: '[图片]',
        source_type: 'image',
        image_data: Buffer.from(imageBase64, 'base64'),
        timestamp: Math.floor(Date.now() / 1000),
      })

      console.log(`[Application] 已保存图片消息 [${result.id}]`)

      // 广播消息保存事件
      this.uiPlugin?.broadcastMessageAdded(result.id, this.currentSessionId, 'assistant')
    }
    catch (error) {
      console.error('[Application] 保存图片失败:', error)
    }
  }

  /**
   * 关闭应用
   */
  async shutdown(): Promise<void> {
    if (!this.running) {
      return
    }

    console.log('[Application] 正在关闭应用...')
    this.running = false

    try {
      // 关闭协议
      if (this.protocol) {
        try {
          await this.protocol.closeAudioChannel()
        }
        catch (error) {
          console.error('[Application] 关闭协议失败:', error)
        }
      }

      // 停止并关闭所有插件
      await this.plugins.stopAll()
      await this.plugins.shutdownAll()

      // 销毁快捷键管理器
      this.shortcutManager?.destroy()

      console.log('[Application] 应用关闭完成')
    }
    catch (error) {
      console.error('[Application] 关闭应用时出错:', error)
    }
  }
}

/**
 * 获取应用单例
 */
export function getApplication(): Application {
  return Application.getInstance()
}
