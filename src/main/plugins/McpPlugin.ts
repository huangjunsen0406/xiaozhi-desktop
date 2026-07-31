import type { ImageSourceType } from '@shared/types'
import type { PluginCommands, PluginContext } from '../core'
import type { McpServer } from '../mcp/McpServer'
import type { McpJsonMessage } from '../types/protocol'
import type { UIPlugin } from './UIPlugin'
import { Events } from '../core'
import { isMcpMessage, isServerMessage } from '../types/protocol'
import { getLogger } from '../utils/logger'

import { Plugin } from './Plugin'

const logger = getLogger('McpPlugin')

/**
 * MCP 插件
 * 负责接收服务端的 MCP 消息并转发到 McpServer 处理
 *
 * 不直接持有 protocol 引用，通过 cmd.sendMcpMessage 发送消息，
 * 实现与协议层完全解耦。
 *
 * McpServer 由容器/pluginWiring 创建并注入，不再依赖业务路径 getInstance()。
 */
export class McpPlugin extends Plugin {
  readonly name = 'McpPlugin'
  readonly priority = 20 // 工具注册，需要较早初始化

  static readonly dependencies: string[] = ['UIPlugin']

  readonly metadata = {
    name: 'McpPlugin',
    version: '1.1.0',
    description: 'MCP (Model Context Protocol) 插件，负责工具注册和调用',
    author: 'Junsen',
  }

  private mcpServer: McpServer | null = null

  /**
   * @param server 容器持有的 McpServer 实例（必传；由 pluginWiring 注入）
   */
  constructor(server: McpServer) {
    super()
    this.mcpServer = server
  }

  /**
   * 插件初始化
   */
  async setup(ctx: PluginContext, cmd: PluginCommands): Promise<void> {
    await super.setup(ctx, cmd)

    logger.info('初始化...')

    try {
      if (!this.mcpServer) {
        throw new Error('McpServer 未注入')
      }

      // 设置发送回调：通过 PluginCommands 接口发送 MCP 响应
      const sendCallback = async (message: string): Promise<void> => {
        try {
          await cmd.sendMcpMessage(message)
        }
        catch (error) {
          logger.error('发送 MCP 消息失败', error)
        }
      }

      this.mcpServer.setSendCallback(sendCallback)

      // 设置图片广播回调：通过 UIPlugin 广播图片到渲染进程
      const imageBroadcastCallback = (imageBase64: string, sourceType: ImageSourceType): void => {
        try {
          const uiPlugin = this.getDep<UIPlugin>('UIPlugin')
          uiPlugin.broadcastImage(imageBase64, sourceType)
        }
        catch {
          logger.warn('UIPlugin 不可用，无法广播图片')
        }
      }

      this.mcpServer.setImageBroadcastCallback(imageBroadcastCallback)

      // 设置主题广播回调：通过 UIPlugin 广播主题到渲染进程
      const themeBroadcastCallback = (theme: 'light' | 'dark' | 'auto'): void => {
        try {
          const uiPlugin = this.getDep<UIPlugin>('UIPlugin')
          uiPlugin.broadcastTheme(theme)
        }
        catch {
          logger.warn('UIPlugin 不可用，无法广播主题')
        }
      }

      this.mcpServer.setThemeBroadcastCallback(themeBroadcastCallback)

      // 协议层已 parse 一次；订阅方只做 type guard
      ctx.eventBus.on(Events.INCOMING_JSON, (data) => {
        if (isServerMessage(data) && isMcpMessage(data)) {
          this.handleMcpMessage(data).catch((error) => {
            logger.error('处理 MCP 消息失败', error)
          })
        }
      })

      // 注册通用工具（包含 system, calendar, timer, music 等）
      await this.mcpServer.addCommonTools()

      logger.info('初始化完成')
    }
    catch (error) {
      logger.error('初始化失败', error)
      throw error
    }
  }

  /**
   * 处理 MCP 消息
   */
  private async handleMcpMessage(message: McpJsonMessage): Promise<void> {
    const payload = message.payload
    if (!payload) {
      logger.warn('MCP 消息缺少 payload')
      return
    }

    if (this.mcpServer) {
      await this.mcpServer.parseMessage({ ...payload })
    }
    else {
      logger.error('McpServer 未初始化')
    }
  }

  /**
   * 插件关闭
   */
  async shutdown(): Promise<void> {
    logger.info('正在关闭...')

    // 清除回调引用（不销毁容器持有的 server 实例本身）
    if (this.mcpServer) {
      this.mcpServer.setSendCallback(async () => {})
      this.mcpServer = null
    }

    // 调用父类 shutdown
    await super.shutdown()

    logger.info('已关闭')
  }
}
