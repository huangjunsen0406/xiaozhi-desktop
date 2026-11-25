import type {
  ChatMessageAddedEvent,
  ChatSessionCreatedEvent,
  ImageCapturedEvent,
  ImageSourceType,
} from '@shared/types'
import type { PluginCommands, PluginContext } from '../core'
import type { AudioPlugin } from './AudioPlugin'
import { ListeningModeValue } from '@shared/types'
import { webContents } from 'electron'
import { Events } from '../core'
import { getLogger } from '../utils/logger'
import { Plugin } from './Plugin'

const logger = getLogger('UIPlugin')

/**
 * UI 插件
 * 负责将服务器消息和状态变化广播到渲染进程
 *
 * 职责：
 * - 广播服务器消息（server:message）
 * - 广播设备状态变化（app:state-changed）
 * - 广播消息添加事件（chat:message-added）
 * - 广播图片、主题、表情等 UI 相关事件
 */
export class UIPlugin extends Plugin {
  readonly name = 'UIPlugin'
  readonly priority = 60 // UI 插件在其他插件之后初始化

  static readonly dependencies: string[] = ['AudioPlugin']

  readonly metadata = {
    name: 'UIPlugin',
    version: '1.0.0',
    description: '视图处理插件，负责统一广播到渲染进程',
    author: 'Junsen',
  }

  private audioPlugin: AudioPlugin | null = null

  async setup(ctx: PluginContext, cmd: PluginCommands): Promise<void> {
    await super.setup(ctx, cmd)

    try {
      this.audioPlugin = this.getDep<AudioPlugin>('AudioPlugin')
    }
    catch {
      this.audioPlugin = null
    }

    ctx.eventBus.on(Events.INCOMING_JSON, (data) => {
      this.broadcastToRenderer('server:message', data)
    })

    ctx.eventBus.on(Events.DEVICE_STATE_CHANGED, ({ newState }) => {
      this.broadcastState(newState)
    })
  }

  /**
   * 广播设备状态到渲染进程
   * @param state - 当前设备状态
   */
  broadcastState(state: string): void {
    // 获取完整的状态快照(包含 listeningMode)
    const snapshot = this.ctx
      ? {
          deviceState: this.ctx.getDeviceState(),
          listeningMode: this.ctx.getListeningMode(),
          keepListening: this.ctx.isKeepListening(),
          channelOpen: this.ctx.isAudioChannelOpened(),
        }
      : {
          deviceState: state,
          listeningMode: ListeningModeValue.MANUAL,
          keepListening: false,
          channelOpen: false,
        }

    this.broadcastToRenderer('app:state-changed', snapshot)
    logger.info(`已广播状态变化: ${state}`)
  }

  /**
   * 广播图片到渲染进程（供其他插件调用）
   * @param imageBase64 - base64 编码的图片数据
   * @param sourceType - 图片来源类型：screenshot 或 camera
   */
  broadcastImage(imageBase64: string, sourceType: ImageSourceType): void {
    const payload: ImageCapturedEvent = {
      type: sourceType,
      imageBase64,
      timestamp: Date.now(),
    }

    this.broadcastToRenderer('chat:image-captured', payload)
    logger.info(`已广播 ${sourceType} 图片`)
  }

  /**
   * 广播主题变更到渲染进程（供其他插件调用）
   * @param theme - 主题模式：light, dark, 或 auto
   */
  broadcastTheme(theme: 'light' | 'dark' | 'auto'): void {
    this.broadcastToRenderer('theme:set', theme)
    logger.info(`已广播主题变更: ${theme}`)
  }

  /**
   * 广播表情变更到渲染进程（供其他插件调用）
   * @param emotionType - 表情类型
   */
  broadcastEmotion(emotionType: string): void {
    this.broadcastToRenderer('emotion:changed', emotionType)
    logger.info(`已广播表情变更: ${emotionType}`)
  }

  /**
   * 广播单条消息已添加事件
   * @param messageId - 消息 ID
   * @param sessionId - 会话 ID
   * @param role - 消息角色
   */
  broadcastMessageAdded(messageId: number, sessionId: string, role: 'user' | 'assistant'): void {
    const payload: ChatMessageAddedEvent = {
      messageId,
      sessionId,
      role,
      timestamp: Date.now(),
    }
    this.broadcastToRenderer('chat:message-added', payload)
  }

  broadcastSessionCreated(sessionId: string): void {
    const payload: ChatSessionCreatedEvent = {
      sessionId,
      timestamp: Date.now(),
    }
    this.broadcastToRenderer('chat:session-created', payload)
    logger.info(`已广播会话创建: ${sessionId}`)
  }

  private broadcastToRenderer(channel: string, data: unknown): void {
    const backgroundAudioWindow = this.audioPlugin?.getBackgroundAudioWindow() ?? null
    const allWebContents = webContents.getAllWebContents()

    for (const wc of allWebContents) {
      if (backgroundAudioWindow && wc.id === backgroundAudioWindow.webContents.id)
        continue
      if (wc.isDestroyed())
        continue

      try {
        wc.send(channel, data)
      }
      catch (error) {
        logger.error(`向窗口 ${wc.id} 广播消息失败:`, error)
      }
    }
  }
}
