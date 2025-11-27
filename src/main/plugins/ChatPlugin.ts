import type { Application } from '../services/Application'
import type { JsonMessage } from '../types/protocol'
import type { UIPlugin } from './UIPlugin'
import { Buffer } from 'node:buffer'
import { DatabaseManager } from '../services/database'
import { Plugin } from './Plugin'

/**
 * 聊天插件
 * 负责消息累积、数据库存储和会话管理
 *
 * 职责：
 * - 处理 STT 消息（用户语音识别）保存
 * - 处理 TTS 消息流式累积和保存
 * - 会话管理（按天创建会话）
 * - 通知 UIPlugin 广播消息更新事件
 */
export class ChatPlugin extends Plugin {
  readonly name = 'ChatPlugin'
  readonly priority = 30 // 在 MCP (20) 之后，UI (60) 之前

  readonly metadata = {
    name: 'ChatPlugin',
    version: '1.0.0',
    description: '聊天插件，负责消息存储和会话管理',
    author: 'Junsen',
  }

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

  /**
   * 插件初始化
   */
  async setup(app: Application): Promise<void> {
    await super.setup(app)
    console.log('[ChatPlugin] 初始化...')
  }

  /**
   * 插件启动
   */
  async start(): Promise<void> {
    await super.start()

    // 初始化会话（获取或创建今天的会话）
    this.currentSessionId = this.getTodaySessionId()
    await this.ensureSessionExists(this.currentSessionId)
    console.log(`[ChatPlugin] 当前会话: ${this.currentSessionId}`)

    console.log('[ChatPlugin] 启动完成')
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
      console.log(`[ChatPlugin] 会话已存在: ${sessionId}`)
      return
    }

    // 创建新会话
    const now = Math.floor(Date.now() / 1000)
    db.createChatSession({
      session_id: sessionId,
      title: this.formatSessionTitle(sessionId),
      started_at: now,
    })

    console.log(`[ChatPlugin] 已创建新会话: ${sessionId}`)
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
      console.log(`[ChatPlugin] 检测到日期变化，切换会话: ${this.currentSessionId} → ${todaySessionId}`)
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
   * 设置最近发送的文本（用于过滤 STT 重复）
   * 由 Application.sendText() 调用
   */
  setLastSentText(text: string | null): void {
    this.lastSentText = text
  }

  /**
   * 获取 UIPlugin 实例
   */
  private getUIPlugin(): UIPlugin | undefined {
    return this.app?.getPluginManager().getPlugin<UIPlugin>('ui')
  }

  /**
   * 处理收到的 JSON 消息
   */
  async onIncomingJson(message: JsonMessage): Promise<void> {
    const msgType = message.type

    // 处理 STT 消息
    if (msgType === 'stt' && message.text) {
      await this.handleSttMessage(String(message.text))
    }

    // 处理 TTS 消息
    if (msgType === 'tts') {
      await this.handleTtsMessage(message)
    }

    // 缓存图片数据
    if (msgType === 'image' && (message as { image_data?: string }).image_data) {
      this.messageAccumulator.pendingImageData = {
        type: (message as { image_type?: string }).image_type || 'screenshot',
        data: (message as { image_data?: string }).image_data!,
      }
      console.log('[ChatPlugin] 已缓存图片数据')
    }

    // 跟踪情感
    if ((message as { emotion?: string }).emotion) {
      this.messageAccumulator.currentEmotion = (message as { emotion?: string }).emotion!
    }
  }

  /**
   * 处理 STT 消息（保存用户语音识别文本）
   */
  private async handleSttMessage(text: string): Promise<void> {
    try {
      // 过滤掉音频触发工具的提示消息（用户真实文本已在 sendTextViaAudio 中保存）
      if (text === '获取用户输入文本。') {
        console.log('[ChatPlugin] 过滤掉工具触发提示消息，跳过保存')
        return
      }

      // 过滤掉 sendText 发送后服务端返回的 STT 消息（用户文本已在 sendText 中保存）
      if (this.lastSentText && text === this.lastSentText) {
        console.log('[ChatPlugin] 过滤掉 sendText 返回的 STT 消息，跳过保存')
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

      console.log(`[ChatPlugin] 已保存 STT 消息 [${result.id}]: ${text.substring(0, 30)}...`)

      // 广播消息保存事件
      this.getUIPlugin()?.broadcastMessageAdded(result.id, this.currentSessionId, 'user')
    }
    catch (error) {
      console.error('[ChatPlugin] 保存 STT 消息失败:', error)
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
      console.log('[ChatPlugin] TTS 开始，重置累积器')
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
      console.log('[ChatPlugin] TTS 结束，准备保存')
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
        console.log(`[ChatPlugin] 已保存图片消息 [${imageResult.id}]`)
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
        console.log(`[ChatPlugin] 已保存 TTS 消息 [${textResult.id}]: ${
          this.messageAccumulator.ttsContent.substring(0, 30)
        }...`)
      }

      // 3. 广播消息保存事件
      if (savedMessageIds.length > 0) {
        this.getUIPlugin()?.broadcastMessagesBatchAdded(savedMessageIds, this.currentSessionId)
      }

      // 4. 重置累积器
      this.resetMessageAccumulator()
    }
    catch (error) {
      console.error('[ChatPlugin] 保存 TTS 回复失败:', error)
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
   * 保存用户文本消息（由 Application.sendText() 调用）
   */
  async saveUserTextMessage(text: string): Promise<void> {
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
      console.log(`[ChatPlugin] 已保存用户文本消息 [${result.id}]`)
      this.getUIPlugin()?.broadcastMessageAdded(result.id, this.currentSessionId, 'user')
    }
    catch (error) {
      console.error('[ChatPlugin] 保存用户文本消息失败:', error)
    }
  }

  /**
   * 保存图片到数据库（供工具调用）
   * @param imageBase64 - base64 编码的图片数据
   * @param sourceType - 图片来源类型
   */
  async saveImage(imageBase64: string, sourceType: 'screenshot' | 'camera'): Promise<void> {
    try {
      console.log(`[ChatPlugin] 保存 ${sourceType} 图片到数据库`)

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

      console.log(`[ChatPlugin] 已保存图片消息 [${result.id}]`)

      // 广播消息保存事件
      this.getUIPlugin()?.broadcastMessageAdded(result.id, this.currentSessionId, 'assistant')
    }
    catch (error) {
      console.error('[ChatPlugin] 保存图片失败:', error)
    }
  }

  /**
   * 插件关闭
   */
  async shutdown(): Promise<void> {
    console.log('[ChatPlugin] 正在关闭...')

    // 重置状态
    this.resetMessageAccumulator()
    this.lastSentText = null

    await super.shutdown()

    console.log('[ChatPlugin] 已关闭')
  }
}
