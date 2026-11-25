import type { ServerMcpMessage } from '@shared/types'
import type { PluginCommands, PluginContext } from '../core'
import type { McpServer } from '../mcp/McpServer'
import type { UIPlugin } from './UIPlugin'
import { isServerMcpMessage } from '@shared/types'
import { Events } from '../core'
import { getLogger } from '../utils/logger'
import { Plugin } from './Plugin'

const logger = getLogger('McpPlugin')

export class McpPlugin extends Plugin {
  readonly name = 'McpPlugin'
  readonly priority = 20

  static readonly dependencies: string[] = ['UIPlugin']

  readonly metadata = {
    name: 'McpPlugin',
    version: '1.1.0',
    description: 'MCP (Model Context Protocol) 插件，负责工具注册和调用',
    author: 'Junsen',
  }

  private mcpServer: McpServer | null

  constructor(server: McpServer) {
    super()
    this.mcpServer = server
  }

  async setup(ctx: PluginContext, cmd: PluginCommands): Promise<void> {
    await super.setup(ctx, cmd)
    logger.info('初始化...')

    const server = this.mcpServer!
    server.setSendCallback(async (message: string): Promise<void> => {
      try {
        await cmd.sendMcpMessage(message)
      }
      catch (error) {
        logger.error('发送 MCP 消息失败', error)
      }
    })

    server.setThemeBroadcastCallback((theme: 'light' | 'dark' | 'auto'): void => {
      try {
        this.getDep<UIPlugin>('UIPlugin').broadcastTheme(theme)
      }
      catch {
        logger.warn('UIPlugin 不可用，无法广播主题')
      }
    })

    ctx.eventBus.on(Events.INCOMING_JSON, (data) => {
      if (isServerMcpMessage(data)) {
        this.handleMcpMessage(data).catch((error) => {
          logger.error('处理 MCP 消息失败', error)
        })
      }
    })

    await server.addCommonTools()
    logger.info('初始化完成')
  }

  private async handleMcpMessage(message: ServerMcpMessage): Promise<void> {
    if (!message.payload) {
      logger.warn('MCP 消息缺少 payload')
      return
    }
    await this.mcpServer?.parseMessage({ ...message.payload })
  }

  async shutdown(): Promise<void> {
    logger.info('正在关闭...')
    if (this.mcpServer) {
      this.mcpServer.setSendCallback(async () => {})
      this.mcpServer = null
    }
    await super.shutdown()
    logger.info('已关闭')
  }
}
