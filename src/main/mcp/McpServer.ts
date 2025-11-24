import type {
  JsonRpcRequest,
  JsonRpcResponse,
  McpTool,
  McpToolJson,
  McpToolResult,
  ToolCallback,
} from './types'
import { SystemToolsManager } from './tools/SystemToolsManager'
import { PropertyList, PropertyType } from './types'

/**
 * MCP Server 实现
 * 单例模式，管理所有 MCP 工具
 * 参考: https://modelcontextprotocol.io/specification/2024-11-05
 */
export class McpServer {
  private static instance: McpServer | null = null
  private tools: McpTool[] = []
  private sendCallback: ((message: string) => Promise<void>) | null = null
  private sendText: string = '' // 存储用户发送的文本，供 get_user_input 工具读取
  private visionConfig: { url?: string, token?: string } = {} // 存储 vision 配置供截图工具使用

  private constructor() {}

  static getInstance(): McpServer {
    if (!McpServer.instance) {
      McpServer.instance = new McpServer()
    }
    return McpServer.instance
  }

  /**
   * 设置发送消息的回调
   */
  setSendCallback(callback: (message: string) => Promise<void>): void {
    this.sendCallback = callback
  }

  /**
   * 添加工具（支持两种调用方式）
   */
  addTool(tool: McpTool): void
  addTool(name: string, description: string, properties: PropertyList, callback: ToolCallback): void
  addTool(
    toolOrName: McpTool | string,
    description?: string,
    properties?: PropertyList,
    callback?: ToolCallback,
  ): void {
    let tool: McpTool

    if (typeof toolOrName === 'string') {
      // 从参数创建工具
      if (!description || !properties || !callback) {
        throw new Error('Missing required parameters for tool creation')
      }
      tool = {
        name: toolOrName,
        description,
        properties,
        callback,
      }
    }
    else {
      tool = toolOrName
    }

    // 检查是否已存在
    if (this.tools.some(t => t.name === tool.name)) {
      console.warn(`[MCP] Tool ${tool.name} already added`)
      return
    }

    console.log(`[MCP] Add tool: ${tool.name}`)
    this.tools.push(tool)
  }

  /**
   * 添加通用工具
   *
   * **重要**: 为了提升响应速度，我们把常用的工具放在前面，利用 Prompt Cache 的特性。
   * 策略：
   * 1. 备份现有工具列表
   * 2. 清空列表
   * 3. 添加常用工具（如音量控制、摄像头等）到前面
   * 4. 将原有工具追加到后面
   */
  addCommonTools(): void {
    console.log('[MCP] Adding common tools...')

    try {
      // 备份原有工具列表
      const originalTools = [...this.tools]
      this.tools = []

      // 注册系统工具（常用工具将被优先添加）
      const systemManager = SystemToolsManager.getInstance()
      systemManager.init(
        this.addTool.bind(this),
        PropertyList,
        PropertyType,
      )

      // TODO: 注册其他工具管理器
      // CalendarManager.getInstance().init(this.addTool.bind(this), PropertyList, PropertyType)
      // TimerManager.getInstance().init(this.addTool.bind(this), PropertyList, PropertyType)
      // MusicManager.getInstance().init(this.addTool.bind(this), PropertyList, PropertyType)

      // 将原有工具恢复到列表末尾
      this.tools.push(...originalTools)

      console.log(`[MCP] Total tools registered: ${this.tools.length}`)
    }
    catch (error) {
      console.error('[MCP] Failed to add common tools:', error)
    }
  }

  /**
   * 解析 MCP 消息
   */
  async parseMessage(message: string | Record<string, unknown>): Promise<void> {
    try {
      const data: JsonRpcRequest
        = typeof message === 'string'
          ? JSON.parse(message) as JsonRpcRequest
          : message as unknown as JsonRpcRequest

      console.log('[MCP] 解析消息:', JSON.stringify(data, null, 2))

      // 检查 JSONRPC 版本
      if (data.jsonrpc !== '2.0') {
        console.error(`[MCP] Invalid JSONRPC version: ${data.jsonrpc}`)
        return
      }

      const { method, id, params } = data

      if (!method) {
        console.error('[MCP] Missing method')
        return
      }

      // 忽略通知消息
      if (method.startsWith('notifications')) {
        console.log(`[MCP] 忽略通知消息: ${method}`)
        return
      }

      if (id === undefined) {
        console.error(`[MCP] Invalid id for method: ${method}`)
        return
      }

      console.log(`[MCP] 处理方法: ${method}, ID: ${id}`)

      // 路由到不同的处理器
      if (method === 'initialize') {
        await this.handleInitialize(id, params)
      }
      else if (method === 'tools/list') {
        await this.handleToolsList(id, params)
      }
      else if (method === 'tools/call') {
        await this.handleToolCall(id, params)
      }
      else {
        console.error(`[MCP] Method not implemented: ${method}`)
        await this.replyError(id, `Method not implemented: ${method}`)
      }
    }
    catch (error) {
      console.error('[MCP] Error parsing message:', error)
      // 尝试回复错误（如果有 id）
      if (typeof error === 'object' && error && 'id' in error) {
        await this.replyError(error.id as string | number, String(error))
      }
    }
  }

  /**
   * 处理 initialize 请求
   */
  private async handleInitialize(
    id: string | number,
    params?: Record<string, unknown>,
  ): Promise<void> {
    // 解析 capabilities（如 vision URL）
    const capabilities = params?.capabilities as Record<string, unknown> | undefined
    if (capabilities) {
      await this.parseCapabilities(capabilities)
    }

    // 返回服务器信息
    const result = {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: {
        name: 'Xiaozhi Desktop',
        version: '1.0.0',
      },
    }

    await this.replyResult(id, result)
  }

  /**
   * 处理 tools/list 请求
   */
  private async handleToolsList(
    id: string | number,
    params?: Record<string, unknown>,
  ): Promise<void> {
    const cursor = (params?.cursor as string) || ''
    const maxPayloadSize = 8000

    const toolsJson: McpToolJson[] = []
    let totalSize = 0
    let foundCursor = !cursor
    let nextCursor = ''

    for (const tool of this.tools) {
      // 如果还没找到起始位置，继续搜索
      if (!foundCursor) {
        if (tool.name === cursor) {
          foundCursor = true
        }
        else {
          continue
        }
      }

      // 构建工具 JSON
      const toolJson: McpToolJson = {
        name: tool.name,
        description: tool.description,
        inputSchema: {
          type: 'object',
          properties: tool.properties.toJson(),
          required: tool.properties.getRequired(),
        },
      }

      const toolSize = JSON.stringify(toolJson).length

      if (totalSize + toolSize + 100 > maxPayloadSize) {
        nextCursor = tool.name
        break
      }

      toolsJson.push(toolJson)
      totalSize += toolSize
    }

    const result: Record<string, unknown> = { tools: toolsJson }
    if (nextCursor) {
      result.nextCursor = nextCursor
    }

    await this.replyResult(id, result)
  }

  /**
   * 处理 tools/call 请求
   */
  private async handleToolCall(
    id: string | number,
    params?: Record<string, unknown>,
  ): Promise<void> {
    console.log(`[MCP] 收到工具调用请求! ID=${id}, 参数=`, params)

    const toolName = params?.name as string | undefined
    if (!toolName) {
      await this.replyError(id, 'Missing tool name')
      return
    }

    console.log(`[MCP] 尝试调用工具: ${toolName}`)

    // 查找工具
    const tool = this.tools.find(t => t.name === toolName)
    if (!tool) {
      await this.replyError(id, `Unknown tool: ${toolName}`)
      return
    }

    // 获取参数
    const args = (params?.arguments as Record<string, unknown>) || {}

    console.log(`[MCP] 开始执行工具 ${toolName}, 参数:`, args)

    // 调用工具
    try {
      const result = await this.callTool(tool, args)
      console.log(`[MCP] 工具 ${toolName} 执行成功，结果:`, result)
      await this.replyResult(id, JSON.parse(result))
    }
    catch (error) {
      console.error(`[MCP] 工具 ${toolName} 执行失败:`, error)
      await this.replyError(id, String(error))
    }
  }

  /**
   * 调用工具
   */
  private async callTool(tool: McpTool, args: Record<string, unknown>): Promise<string> {
    try {
      // 解析参数
      const parsedArgs = tool.properties.parseArguments(args)

      // 调用回调函数
      const result = await tool.callback(parsedArgs)

      // 格式化返回值
      let text: string
      if (typeof result === 'boolean') {
        text = result ? 'true' : 'false'
      }
      else if (typeof result === 'number') {
        text = String(result)
      }
      else {
        text = String(result)
      }

      const mcpResult: McpToolResult = {
        content: [{ type: 'text', text }],
        isError: false,
      }

      return JSON.stringify(mcpResult)
    }
    catch (error) {
      console.error(`[MCP] Error calling tool ${tool.name}:`, error)
      const mcpResult: McpToolResult = {
        content: [{ type: 'text', text: String(error) }],
        isError: true,
      }
      return JSON.stringify(mcpResult)
    }
  }

  /**
   * 解析 capabilities
   */
  private async parseCapabilities(capabilities: Record<string, unknown>): Promise<void> {
    const vision = capabilities.vision as Record<string, unknown> | undefined
    if (vision && typeof vision === 'object') {
      const url = vision.url as string | undefined
      const token = vision.token as string | undefined
      if (url) {
        // 保存 vision 配置（供截图等工具使用）
        this.visionConfig.url = url
        this.visionConfig.token = token

        // 同时直接设置到 Camera 实例（与 C++ 版本保持一致）
        const { getCameraInstance } = await import('./tools/camera')
        const { getConfigManager } = await import('../services/configManagerDB')

        const configManager = getConfigManager()
        const allConfig = configManager.getAll()

        const cameraOptions = {
          vlApiKey: allConfig.VLapi_key,
          vlUrl: allConfig.Local_VL_url,
          vlModel: allConfig.models,
          explainUrl: url,
          explainToken: token,
          deviceId: configManager.getDeviceId(),
          clientId: configManager.getClientId(),
        }

        const camera = getCameraInstance(cameraOptions)

        // 如果是 WebCamera，直接设置 URL 和 Token
        if ('setExplainUrl' in camera && typeof camera.setExplainUrl === 'function') {
          camera.setExplainUrl(url)
          if (token && 'setExplainToken' in camera && typeof camera.setExplainToken === 'function') {
            camera.setExplainToken(token)
          }
          console.log(`[MCP] Vision service configured with URL: ${url}`)
        }
      }
    }
  }

  /**
   * 获取 Vision 配置
   * 供截图等工具使用
   */
  getVisionConfig(): { url?: string, token?: string } {
    return { ...this.visionConfig }
  }

  /**
   * 发送成功响应
   */
  private async replyResult(id: string | number, result: unknown): Promise<void> {
    const payload: JsonRpcResponse = {
      jsonrpc: '2.0',
      id,
      result,
    }

    console.log(`[MCP] 发送成功响应: ID=${id}`)

    if (this.sendCallback) {
      await this.sendCallback(JSON.stringify(payload))
    }
    else {
      console.error('[MCP] Send callback not set!')
    }
  }

  /**
   * 发送错误响应
   */
  private async replyError(id: string | number, message: string): Promise<void> {
    const payload: JsonRpcResponse = {
      jsonrpc: '2.0',
      id,
      error: {
        message,
      },
    }

    console.error(`[MCP] 发送错误响应: ID=${id}, 错误=${message}`)

    if (this.sendCallback) {
      await this.sendCallback(JSON.stringify(payload))
    }
  }

  /**
   * 设置用户发送的文本
   * 用于基于音频触发的文本输入场景
   */
  setSendText(text: string): void {
    this.sendText = text
    console.log(`[MCP] 用户文本已存储: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`)
  }

  /**
   * 获取用户发送的文本
   * 供 get_user_input MCP 工具调用
   */
  getSendText(): string {
    return this.sendText
  }

  /**
   * 清空用户文本缓存
   */
  clearSendText(): void {
    this.sendText = ''
  }
}
