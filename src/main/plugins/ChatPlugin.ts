import type { ImageSourceType } from '@shared/types'
import type { PluginCommands, PluginContext } from '../core'
import type { JsonMessage, TtsJsonMessage } from '../types/protocol'
import type { UIPlugin } from './UIPlugin'
import { Buffer } from 'node:buffer'
import { isImageSourceType } from '@shared/types'
import { Events } from '../core'
import { getServiceContainer } from '../core/ServiceContainer'
import { getDatabase } from '../services/database'
import { isImageMessage, isServerMessage, isTtsMessage } from '../types/protocol'
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
 * - 会话管理（按服务端 session_id，不再按自然日）
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

  /** 当前活跃会话（服务端 session_id 或本地占位） */
  private currentSessionId: string = ''

  // 消息累积器（用于情绪和图片）
  private messageAccumulator = {
    currentEmotion: '',
    pendingImageData: null as { type: ImageSourceType, data: string } | null,
  }

  async setup(ctx: PluginContext, cmd: PluginCommands): Promise<void> {
    await super.setup(ctx, cmd)
    logger.info('初始化...')

    ctx.eventBus.on(Events.INCOMING_JSON, (data) => {
      if (!isServerMessage(data))
        return
      this.onIncomingJson(data).catch((error) => {
        logger.error('处理 JSON 消息失败', error)
      })
    })
  }

  async start(): Promise<void> {
    await super.start()
    // 启动时不预创建「今天」会话；等服务端 session_id 或首条消息再建
    logger.info('启动完成（会话按服务端 session_id）')
  }

  /**
   * 从消息 / 协议解析服务端 session id
   */
  private resolveServerSessionId(message?: JsonMessage): string | undefined {
    const fromMsg = message && typeof (message as { session_id?: unknown }).session_id === 'string'
      ? String((message as { session_id: string }).session_id).trim()
      : ''
    if (fromMsg)
      return fromMsg

    try {
      const protocol = getServiceContainer().getProtocol()
      const sid = protocol?.getSessionId?.()?.trim()
      if (sid)
        return sid
    }
    catch {
      // container / protocol 尚未就绪
    }
    return undefined
  }

  private createLocalSessionId(): string {
    return `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  }

  /**
   * @returns 是否为新创建
   */
  private async ensureSessionExists(sessionId: string, title?: string): Promise<boolean> {
    const db = getDatabase()
    const existingSession = db.getChatSession(sessionId)
    if (existingSession)
      return false

    const now = Math.floor(Date.now() / 1000)
    db.createChatSession({
      session_id: sessionId,
      title: title || '新对话',
      started_at: now,
    })
    logger.info(`已创建新会话: ${sessionId}`)
    return true
  }

  private async bindSession(sessionId: string, opts?: { titleFromUserText?: string }): Promise<void> {
    if (!sessionId)
      return

    const isNew = await this.ensureSessionExists(sessionId)
    const prev = this.currentSessionId
    this.currentSessionId = sessionId

    if (isNew) {
      this.getUIPlugin()?.broadcastSessionCreated(sessionId)
    }
    else if (prev && prev !== sessionId) {
      logger.info(`切换会话: ${prev} -> ${sessionId}`)
    }

    if (opts?.titleFromUserText) {
      this.maybeSetTitleFromFirstUserMessage(sessionId, opts.titleFromUserText)
    }
  }

  private maybeSetTitleFromFirstUserMessage(sessionId: string, text: string): void {
    try {
      const db = getDatabase()
      const session = db.getChatSession(sessionId)
      if (!session)
        return
      if (session.title && session.title !== '新对话')
        return
      const title = text.replace(/\s+/g, ' ').trim().slice(0, 30) || '新对话'
      db.updateChatSessionTitle(sessionId, title)
    }
    catch (error) {
      logger.warn('更新会话标题失败', error)
    }
  }

  private async ensureActiveSession(message?: JsonMessage, titleFromUserText?: string): Promise<string> {
    const serverId = this.resolveServerSessionId(message)
    if (serverId) {
      await this.bindSession(serverId, { titleFromUserText })
      return this.currentSessionId
    }

    if (this.currentSessionId) {
      if (titleFromUserText)
        this.maybeSetTitleFromFirstUserMessage(this.currentSessionId, titleFromUserText)
      return this.currentSessionId
    }

    const localId = this.createLocalSessionId()
    await this.bindSession(localId, { titleFromUserText })
    return this.currentSessionId
  }

  getCurrentSessionId(): string {
    return this.currentSessionId
  }

  private getUIPlugin(): UIPlugin | undefined {
    try {
      return this.getDep<UIPlugin>('UIPlugin')
    }
    catch {
      return undefined
    }
  }

  private async onIncomingJson(message: JsonMessage): Promise<void> {
    const msgType = message.type

    // 任意带 session_id 的消息：尽早绑定服务端会话
    const sid = this.resolveServerSessionId(message)
    if (sid && sid !== this.currentSessionId) {
      await this.bindSession(sid)
    }

    if (msgType === 'stt' && message.text) {
      await this.handleSttMessage(String(message.text), message)
    }

    if (isTtsMessage(message)) {
      await this.handleTtsMessage(message)
    }

    if (isImageMessage(message)) {
      this.messageAccumulator.pendingImageData = {
        type: isImageSourceType(message.image_type) ? message.image_type : 'screenshot',
        data: message.image_data,
      }
      logger.info('已缓存图片数据')
    }

    if (message.type === 'llm' && message.emotion) {
      this.messageAccumulator.currentEmotion = message.emotion
    }
  }

  private async handleSttMessage(text: string, message?: JsonMessage): Promise<void> {
    try {
      if (text === '获取用户输入文本。') {
        logger.info('过滤掉工具触发提示消息，跳过保存')
        return
      }

      const sessionId = await this.ensureActiveSession(message, text)

      const db = getDatabase()
      const result = db.addChatMessage({
        session_id: sessionId,
        role: 'user',
        content: text,
        source_type: 'text',
        timestamp: Math.floor(Date.now() / 1000),
      })

      logger.info(`已保存用户消息 [${result.id}]: ${text.substring(0, 30)}...`)
      this.getUIPlugin()?.broadcastMessageAdded(result.id, sessionId, 'user')
    }
    catch (error) {
      logger.error('保存用户消息失败', error)
    }
  }

  private async handleTtsMessage(message: TtsJsonMessage): Promise<void> {
    const { state, text } = message

    if (state === 'start') {
      await this.ensureActiveSession(message)
      logger.info('TTS 开始')
    }
    else if (state === 'sentence_start' && text) {
      if (text.startsWith('% ')) {
        logger.info('过滤工具提示句子:', text)
        return
      }

      const sessionId = await this.ensureActiveSession(message)

      const db = getDatabase()
      const result = db.addChatMessage({
        session_id: sessionId,
        role: 'assistant',
        content: text,
        emotion: this.messageAccumulator.currentEmotion || undefined,
        source_type: 'tts',
        timestamp: Math.floor(Date.now() / 1000),
      })

      logger.info(`已保存 TTS 句子 [${result.id}]: ${text.substring(0, 30)}...`)
      this.getUIPlugin()?.broadcastMessageAdded(result.id, sessionId, 'assistant')
    }
    else if (state === 'sentence_end' && text) {
      logger.info('忽略 sentence_end')
    }
    else if (state === 'stop') {
      logger.info('TTS 结束')

      if (this.messageAccumulator.pendingImageData) {
        const sessionId = await this.ensureActiveSession(message)
        const db = getDatabase()
        const imageResult = db.addChatMessage({
          session_id: sessionId,
          role: 'assistant',
          content: '[图片]',
          source_type: 'image',
          image_data: Buffer.from(this.messageAccumulator.pendingImageData.data, 'base64'),
          timestamp: Math.floor(Date.now() / 1000),
        })

        logger.info(`已保存图片消息 [${imageResult.id}]`)
        this.getUIPlugin()?.broadcastMessageAdded(imageResult.id, sessionId, 'assistant')
      }

      this.resetMessageAccumulator()
    }
  }

  private resetMessageAccumulator(): void {
    this.messageAccumulator.currentEmotion = ''
    this.messageAccumulator.pendingImageData = null
  }

  async saveImage(imageBase64: string, sourceType: ImageSourceType): Promise<void> {
    try {
      logger.info(`保存 ${sourceType} 图片到数据库`)
      const sessionId = await this.ensureActiveSession(undefined)

      const db = getDatabase()
      const result = db.addChatMessage({
        session_id: sessionId,
        role: 'assistant',
        content: '[图片]',
        source_type: 'image',
        image_data: Buffer.from(imageBase64, 'base64'),
        timestamp: Math.floor(Date.now() / 1000),
      })

      logger.info(`已保存图片消息 [${result.id}] 到会话 ${sessionId}`)
      this.getUIPlugin()?.broadcastMessageAdded(result.id, sessionId, 'assistant')
    }
    catch (error) {
      logger.error('保存图片失败', error)
    }
  }

  async shutdown(): Promise<void> {
    logger.info('正在关闭...')
    this.resetMessageAccumulator()
    await super.shutdown()
    logger.info('已关闭')
  }
}
