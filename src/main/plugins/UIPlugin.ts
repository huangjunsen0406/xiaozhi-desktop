import type { PluginCommands, PluginContext, StateChangeData } from '../core'
import type { JsonMessage } from '../types/protocol'
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

  /**
   * 插件初始化
   */
  async setup(ctx: PluginContext, cmd: PluginCommands): Promise<void> {
    await super.setup(ctx, cmd)

    // 订阅 JSON 消息事件
    ctx.eventBus.on(Events.INCOMING_JSON, (data) => {
      const message = data as JsonMessage
      this.broadcastToRenderer('server:message', message)
    })

    // 订阅设备状态变化事件
    ctx.eventBus.on(Events.DEVICE_STATE_CHANGED, (data) => {
      const { newState } = data as StateChangeData
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
          keepListening: false, // 由 StateManager 管理
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
  broadcastImage(imageBase64: string, sourceType: 'screenshot' | 'camera'): void {
    const payload = {
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
    const payload = {
      messageId,
      sessionId,
      role,
      timestamp: Date.now(),
    }
    this.broadcastToRenderer('chat:message-added', payload)
  }

  /**
   * 广播批量消息已添加事件（图片+文本组合）
   * @param messageIds - 消息 ID 列表
   * @param sessionId - 会话 ID
   */
  broadcastMessagesBatchAdded(messageIds: number[], sessionId: string): void {
    const payload = {
      messageIds,
      sessionId,
      timestamp: Date.now(),
    }
    this.broadcastToRenderer('chat:messages-batch-added', payload)
  }

  /**
   * 广播会话创建事件（用于跨天自动创建新会话）
   * @param sessionId - 会话 ID
   */
  broadcastSessionCreated(sessionId: string): void {
    const payload = {
      sessionId,
      timestamp: Date.now(),
    }
    this.broadcastToRenderer('chat:session-created', payload)
    logger.info(`已广播会话创建: ${sessionId}`)
  }

  /**
   * 广播消息到渲染进程
   * @param channel - IPC 通道名称
   * @param data - 要发送的数据
   */
  private broadcastToRenderer(channel: string, data: unknown): void {
    let backgroundAudioWindow: Electron.BrowserWindow | null = null
    try {
      const audioPlugin = this.getDep<AudioPlugin>('AudioPlugin')
      backgroundAudioWindow = audioPlugin.getBackgroundAudioWindow()
    }
    catch {
      // AudioPlugin 依赖不可用，忽略
    }

    // 获取所有 webContents
    const allWebContents = webContents.getAllWebContents()

    allWebContents.forEach((wc) => {
      // 跳过后台音频窗口
      if (backgroundAudioWindow && wc.id === backgroundAudioWindow.webContents.id) {
        return
      }

      // 跳过已销毁的窗口
      if (wc.isDestroyed()) {
        return
      }

      try {
        wc.send(channel, data)
      }
      catch (error) {
        logger.error(`向窗口 ${wc.id} 广播消息失败:`, error)
      }
    })
  }
}
