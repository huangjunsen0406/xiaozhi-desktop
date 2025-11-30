import type { Application } from '../services/Application'
import type { JsonMessage } from '../types/protocol'
import type { UIPlugin } from './UIPlugin'
import { McpServer } from '../mcp/McpServer'
import { Plugin } from './Plugin'

import { createLogger } from '../utils/logger'

const logger = createLogger('McpPlugin')

/**
 * MCP 插件
 * 负责接收服务端的 MCP 消息并转发到 McpServer 处理
 */
export class McpPlugin extends Plugin {
  readonly name = 'McpPlugin'
  readonly priority = 20 // 工具注册，需要较早初始化

  readonly metadata = {
    name: 'McpPlugin',
    version: '1.0.0',
    description: 'MCP (Model Context Protocol) 插件，负责工具注册和调用',
    author: 'Junsen',
  }

  private mcpServer: McpServer | null = null

  /**
   * 插件初始化
   */
  async setup(app: Application): Promise<void> {
    // 调用父类 setup
    await super.setup(app)

    logger.info('初始化...')

    try {
      // 获取 McpServer 单例
      this.mcpServer = McpServer.getInstance()

      // 设置发送回调：通过协议层发送 MCP 响应
      const sendCallback = async (message: string): Promise<void> => {
        try {
          // 通过 app 的公共 API 获取 protocol
          const protocol = this.app?.getProtocol()
          if (!protocol) {
            logger.error('Protocol not available')
            return
          }
          // 调用协议层的 sendMcpMessage 方法
          await protocol.sendMcpMessage(message)
        }
        catch (error) {
          logger.error('Failed to send MCP message', error)
        }
      }

      this.mcpServer.setSendCallback(sendCallback)

      // 设置图片广播回调：通过 UIPlugin 广播图片到渲染进程
      const imageBroadcastCallback = (imageBase64: string, sourceType: 'screenshot' | 'camera'): void => {
        const pluginManager = this.app?.getPluginManager()
        const uiPlugin = pluginManager?.getPlugin<UIPlugin>('UIPlugin')
        if (uiPlugin) {
          uiPlugin.broadcastImage(imageBase64, sourceType)
        }
        else {
          logger.warn('UIPlugin not found, cannot broadcast image')
        }
      }

      this.mcpServer.setImageBroadcastCallback(imageBroadcastCallback)

      // 设置主题广播回调：通过 UIPlugin 广播主题到渲染进程
      const themeBroadcastCallback = (theme: 'light' | 'dark' | 'auto'): void => {
        const pluginManager = this.app?.getPluginManager()
        const uiPlugin = pluginManager?.getPlugin<UIPlugin>('UIPlugin')
        if (uiPlugin) {
          uiPlugin.broadcastTheme(theme)
        }
        else {
          logger.warn('UIPlugin not found, cannot broadcast theme')
        }
      }

      this.mcpServer.setThemeBroadcastCallback(themeBroadcastCallback)

      // 注册通用工具（包含 system, calendar, timer, music, iot 等）
      await this.mcpServer.addCommonTools()

      logger.info('✓ 初始化完成')
    }
    catch (error) {
      logger.error('✗ 初始化失败', error)
      throw error
    }
  }

  /**
   * 接收到 JSON 消息回调
   */
  async onIncomingJson(message: JsonMessage): Promise<void> {
    try {
      // 只处理 MCP 类型的消息
      if (message.type !== 'mcp') {
        return
      }

      const payload = message.payload
      if (!payload) {
        logger.warn('MCP message missing payload')
        return
      }

      // 转发到 McpServer 处理
      if (this.mcpServer) {
        await this.mcpServer.parseMessage(payload as Record<string, unknown>)
      }
      else {
        logger.error('McpServer not initialized')
      }
    }
    catch (error) {
      logger.error('Error handling incoming JSON', error)
    }
  }

  /**
   * 插件关闭
   */
  async shutdown(): Promise<void> {
    logger.info('正在关闭...')

    // 清除回调引用
    if (this.mcpServer) {
      this.mcpServer.setSendCallback(async () => {})
      this.mcpServer = null
    }

    // 调用父类 shutdown
    await super.shutdown()

    logger.info('✓ 已关闭')
  }
}
