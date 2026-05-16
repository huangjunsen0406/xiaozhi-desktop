import type { PluginCommands, PluginContext } from '../core'
import type { JsonMessage } from '../types/protocol'
import type { UIPlugin } from './UIPlugin'
import { Buffer } from 'node:buffer'
import { Events } from '../core'
import { DatabaseManager } from '../services/database'
import { getLogger } from '../utils/logger'

import { Plugin } from './Plugin'

const logger = getLogger('ChatPlugin')

/**
 * 聊天插件
 * 负责消息数据库存储和会话管理
 *
 * 职责：
 * - 处理 STT 消息（用户语音识别）保存
 * - 处理 TTS 消息逐句保存
 * - 会话管理（按天创建会话）
 * - 通知 UIPlugin 广播消息更新事件
 */
export class ChatPlugin extends Plugin {
  readonly name = 'ChatPlugin'
  readonly priority = 30 // 在 MCP (20) 之后，UI (60) 之前

  static readonly dependencies: string[] = ['UIPlugin']

  readonly metadata = {
    name: 'ChatPlugin',
    version: '1.0.0',
    description: '聊天插件，负责消息存储和会话管理',
    author: 'Junsen',
  }

  // 会话管理（按天）
  private currentSessionId: string = ''

  // 消息累积器（用于情绪和图片）
  private messageAccumulator = {
    currentEmotion: '',
    pendingImageData: null as { type: string, data: string } | null,
  }

  /**
   * 插件初始化
   */
  async setup(ctx: PluginContext, cmd: PluginCommands): Promise<void> {
    await super.setup(ctx, cmd)
    logger.info('初始化...')

    // 订阅 JSON 消息事件
    ctx.eventBus.on(Events.INCOMING_JSON, (data) => {
      const message = data as JsonMessage
      this.onIncomingJson(message).catch((error) => {
        logger.error('处理 JSON 消息失败', error)
      })
    })
  }

  /**
   * 插件启动
   */
  async start(): Promise<void> {
    await super.start()

    // 初始化会话（获取或创建今天的会话）
    this.currentSessionId = this.getTodaySessionId()
    await this.ensureSessionExists(this.currentSessionId)
    logger.info(`当前会话: ${this.currentSessionId}`)

    logger.info('启动完成')
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
      logger.info(`会话已存在: ${sessionId}`)
      return
    }

    // 创建新会话
    const now = Math.floor(Date.now() / 1000)
    db.createChatSession({
      session_id: sessionId,
      title: this.formatSessionTitle(sessionId),
      started_at: now,
    })

    logger.info(`已创建新会话: ${sessionId}`)
  }

  /**
   * 格式化会话标题
   * chat_20250125 -> "2025年01月25日"
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
      logger.info(`检测到日期变化，切换会话: ${this.currentSessionId} -> ${todaySessionId}`)

      // 检查会话是否已存在
      const db = DatabaseManager.getInstance()
      const existingSession = db.getChatSession(todaySessionId)
      const isNewSession = !existingSession

      this.currentSessionId = todaySessionId
      await this.ensureSessionExists(todaySessionId)

      // 如果是新创建的会话，通知前端
      if (isNewSession) {
        this.getUIPlugin()?.broadcastSessionCreated(todaySessionId)
      }
    }
  }

  /**
   * 获取当前会话 ID
   */
  getCurrentSessionId(): string {
    return this.currentSessionId
  }

  /**
   * 获取 UIPlugin 实例
   */
  private getUIPlugin(): UIPlugin | undefined {
    try {
      return this.getDep<UIPlugin>('UIPlugin')
    }
    catch {
      return undefined
    }
  }

  /**
   * 处理收到的 JSON 消息
   */
  private async onIncomingJson(message: JsonMessage): Promise<void> {
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
      logger.info('已缓存图片数据')
    }

    // 跟踪情感
    if ((message as { emotion?: string }).emotion) {
      this.messageAccumulator.currentEmotion = (message as { emotion?: string }).emotion!
    }
  }

  /**
   * 处理 STT 消息（保存用户输入）
   * 统一处理所有用户输入，包括语音和文本输入框
   */
  private async handleSttMessage(text: string): Promise<void> {
    try {
      // 过滤掉音频触发工具的提示消息
      if (text === '获取用户输入文本。') {
        logger.info('过滤掉工具触发提示消息，跳过保存')
        return
      }

      // 确保使用今天的会话
      await this.checkAndSwitchSession()

      const db = DatabaseManager.getInstance()
      const result = db.addChatMessage({
        session_id: this.currentSessionId,
        role: 'user',
        content: text,
        source_type: 'text',
        timestamp: Math.floor(Date.now() / 1000),
      })

      logger.info(`已保存用户消息 [${result.id}]: ${text.substring(0, 30)}...`)

      // 广播消息保存事件
      this.getUIPlugin()?.broadcastMessageAdded(result.id, this.currentSessionId, 'user')
    }
    catch (error) {
      logger.error('保存用户消息失败', error)
    }
  }

  /**
   * 处理 TTS 消息（逐句保存）
   */
  private async handleTtsMessage(message: JsonMessage): Promise<void> {
    const state = (message as { state?: string }).state
    const text = (message as { text?: string }).text

    if (state === 'start') {
      // TTS 开始，确保使用今天的会话
      await this.checkAndSwitchSession()
      logger.info('TTS 开始')
    }
    else if (state === 'sentence_start' && text) {
      // 每个句子开始时直接保存到数据库

      // 过滤工具提示行（以 % 开头）
      if (text.startsWith('% ')) {
        logger.info('过滤工具提示句子:', text)
        return
      }

      // 确保使用今天的会话
      await this.checkAndSwitchSession()

      // 直接插入数据库
      const db = DatabaseManager.getInstance()
      const result = db.addChatMessage({
        session_id: this.currentSessionId,
        role: 'assistant',
        content: text,
        emotion: this.messageAccumulator.currentEmotion || undefined,
        source_type: 'tts',
        timestamp: Math.floor(Date.now() / 1000),
      })

      logger.info(`已保存 TTS 句子 [${result.id}]: ${text.substring(0, 30)}...`)

      // 广播消息添加事件
      this.getUIPlugin()?.broadcastMessageAdded(result.id, this.currentSessionId, 'assistant')
    }
    else if (state === 'sentence_end' && text) {
      // sentence_end 只是标记，不需要处理（内容已在 sentence_start 保存）
      logger.info('忽略 sentence_end')
    }
    else if (state === 'stop') {
      // TTS 结束，只保存图片（如果有）
      logger.info('TTS 结束')

      if (this.messageAccumulator.pendingImageData) {
        await this.checkAndSwitchSession()

        const db = DatabaseManager.getInstance()
        const imageResult = db.addChatMessage({
          session_id: this.currentSessionId,
          role: 'assistant',
          content: '[图片]',
          source_type: 'image',
          image_data: Buffer.from(this.messageAccumulator.pendingImageData.data, 'base64'),
          timestamp: Math.floor(Date.now() / 1000),
        })

        logger.info(`已保存图片消息 [${imageResult.id}]`)
        this.getUIPlugin()?.broadcastMessageAdded(imageResult.id, this.currentSessionId, 'assistant')
      }

      // 重置累积器
      this.resetMessageAccumulator()
    }
  }

  /**
   * 重置消息累积器
   */
  private resetMessageAccumulator(): void {
    this.messageAccumulator.currentEmotion = ''
    this.messageAccumulator.pendingImageData = null
  }

  /**
   * 保存图片到数据库（供工具调用）
   * @param imageBase64 - base64 编码的图片数据
   * @param sourceType - 图片来源类型
   */
  async saveImage(imageBase64: string, sourceType: 'screenshot' | 'camera'): Promise<void> {
    try {
      logger.info(`保存 ${sourceType} 图片到数据库`)

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

      logger.info(`已保存图片消息 [${result.id}] 到会话 ${this.currentSessionId}`)

      // 广播消息保存事件
      this.getUIPlugin()?.broadcastMessageAdded(result.id, this.currentSessionId, 'assistant')
    }
    catch (error) {
      logger.error('保存图片失败', error)
    }
  }

  /**
   * 插件关闭
   */
  async shutdown(): Promise<void> {
    logger.info('正在关闭...')

    // 重置状态
    this.resetMessageAccumulator()

    await super.shutdown()

    logger.info('已关闭')
  }
}
