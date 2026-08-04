import type { ImageSourceType } from '@shared/types'
import type { McpHostGetKey, McpToolCatalogItem } from './plugins/types'
import type { MusicPlayer } from './tools/music/MusicPlayer'
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  McpTool,
  McpToolJson,
  McpToolResult,
  ToolCallback,
} from './types'
import path from 'node:path'
import fs from 'fs-extra'
import { getConfigManager } from '../services/configManagerDB'
import { getDatabase } from '../services/database'
import { getLogger } from '../utils/logger'
import { getMcpPluginsDir, isPathInside } from '../utils/paths'
import { resetMcpContext, setMcpContext, setMcpToolRuntime } from './McpContext'
import {
  deriveCatalogGroupKey,
  getGroupLabel,
  getToolLabel,
  loadMcpPluginsFromConfig,
  McpPluginRegistry,
} from './plugins'
import { getCameraInstance } from './tools/camera'
import { ScreenshotTool } from './tools/screenshot/ScreenshotTool'
import { SystemToolsManager } from './tools/SystemToolsManager'
import { TimerService } from './tools/timer/TimerService'
import { PropertyList, PropertyType } from './types'

const logger = getLogger('MCP')

/**
 * MCP Server 实现
 *
 * 由 ServiceContainer / pluginWiring 创建并持有，注入 McpPlugin。
 * 参考: https://modelcontextprotocol.io/specification/2024-11-05
 *
 * 无 getInstance 懒单例；仅 create() + 容器持有。
 * 支持外挂插件加载 + MCP_TOOLS.DISABLED 过滤。
 */
export class McpServer {
  private tools: McpTool[] = []
  private sendCallback: ((message: string) => Promise<void>) | null = null
  private visionConfig: { url?: string, token?: string } = {} // 存储 vision 配置供截图工具使用
  private imageBroadcastCallback: ((imageBase64: string, sourceType: ImageSourceType) => void) | null = null
  private themeBroadcastCallback: ((theme: 'light' | 'dark' | 'auto') => void) | null = null
  /** 容器注入的 MusicPlayer（addCommonTools 时使用） */
  private musicPlayer: MusicPlayer | null = null
  /** 外挂工具归属 */
  private pluginRegistry = new McpPluginRegistry()
  /** 内存中的禁用工具集合（与 DB 同步） */
  private disabledTools = new Set<string>()

  private constructor() {}

  /**
   * 创建新的 McpServer 实例（容器 / pluginWiring 使用）
   */
  static create(): McpServer {
    return new McpServer()
  }

  /**
   * 注入共享 MusicPlayer（bindSharedServices 后调用）
   */
  setMusicPlayer(player: MusicPlayer | null): void {
    this.musicPlayer = player
  }

  /**
   * 释放回调与工具列表（资源池 unbind 时调用）
   */
  detach(): void {
    this.sendCallback = null
    this.imageBroadcastCallback = null
    this.themeBroadcastCallback = null
    this.tools = []
    this.visionConfig = {}
    this.musicPlayer = null
    this.pluginRegistry.clear()
    this.disabledTools.clear()
    resetMcpContext()
  }

  /**
   * 设置发送消息的回调
   */
  setSendCallback(callback: (message: string) => Promise<void>): void {
    this.sendCallback = callback
  }

  /**
   * 从数据库加载 DISABLED 工具黑名单到内存
   */
  loadDisabledToolsFromDb(): void {
    try {
      const names = getDatabase().getMcpDisabledTools()
      this.disabledTools = new Set(names)
      logger.debug('已加载 MCP 工具禁用列表', { count: names.length })
    }
    catch (error) {
      logger.warn('加载 MCP 工具禁用列表失败', error)
      this.disabledTools = new Set()
    }
  }

  /**
   * 持久化并更新内存中的禁用列表
   */
  setDisabledTools(names: string[]): void {
    const unique = Array.from(new Set(names.filter(n => typeof n === 'string' && n.length > 0)))
    try {
      getDatabase().setMcpDisabledTools(unique)
    }
    catch (error) {
      logger.error('保存 MCP 工具禁用列表失败', error)
      throw error
    }
    this.disabledTools = new Set(unique)
    logger.info('MCP 工具禁用列表已更新', { count: unique.length })
  }

  getDisabledTools(): string[] {
    return Array.from(this.disabledTools)
  }

  isToolDisabled(name: string): boolean {
    return this.disabledTools.has(name)
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
      logger.warn('工具已存在', { name: tool.name })
      return
    }

    logger.info('添加工具', { name: tool.name })
    this.tools.push(tool)
  }

  /**
   * 按名称移除工具（外挂 unload 用）
   */
  removeToolsByNames(names: string[]): number {
    if (names.length === 0)
      return 0
    const nameSet = new Set(names)
    const before = this.tools.length
    this.tools = this.tools.filter(t => !nameSet.has(t.name))
    const removed = before - this.tools.length
    if (removed > 0) {
      logger.info('已移除工具', { removed, names })
    }
    return removed
  }

  /**
   * 卸载外挂插件及其工具
   */
  unloadPlugin(pluginId: string): string[] {
    const names = this.pluginRegistry.unloadPlugin(pluginId)
    this.removeToolsByNames(names)
    return names
  }

  /**
   * 卸载全部外挂工具（保留内置）
   */
  unloadAllExternalPlugins(): void {
    const plugins = this.pluginRegistry.getAllPlugins()
    for (const p of plugins) {
      this.unloadPlugin(p.id)
    }
  }

  getPluginRegistry(): McpPluginRegistry {
    return this.pluginRegistry
  }

  /**
   * 排序：外挂工具在前（按 pluginId），内置在后（保持注册顺序）
   * 云端 tools/list 与设置页 catalog 共用，便于模型先看到外挂
   */
  private sortToolsForPresentation(tools: McpTool[]): McpTool[] {
    return tools
      .map((tool, index) => ({ tool, index }))
      .sort((a, b) => {
        const aPlugin = this.pluginRegistry.getPluginIdForTool(a.tool.name)
        const bPlugin = this.pluginRegistry.getPluginIdForTool(b.tool.name)
        const aExt = aPlugin ? 0 : 1
        const bExt = bPlugin ? 0 : 1
        if (aExt !== bExt)
          return aExt - bExt
        if (aPlugin && bPlugin && aPlugin !== bPlugin)
          return aPlugin.localeCompare(bPlugin)
        return a.index - b.index
      })
      .map(({ tool }) => tool)
  }

  /**
   * 当前已注册工具的统一 catalog（内置 + 外挂）
   * 外挂分组在前，组内按 pluginId
   */
  getToolCatalog(): McpToolCatalogItem[] {
    // 确保禁用列表是最新的
    this.loadDisabledToolsFromDb()

    return this.sortToolsForPresentation(this.tools).map((tool) => {
      const pluginId = this.pluginRegistry.getPluginIdForTool(tool.name)
      const plugin = pluginId ? this.pluginRegistry.getPlugin(pluginId) : undefined
      // 外挂按 manifest.id 分组、name 展示；内置按 self.<domain>
      const groupKey = deriveCatalogGroupKey(tool.name, pluginId)
      return {
        name: tool.name,
        label: getToolLabel(tool.name, plugin?.name),
        group: getGroupLabel(groupKey, plugin?.name),
        groupKey,
        description: tool.description,
        enabled: !this.disabledTools.has(tool.name),
        source: pluginId ? 'plugin' as const : 'builtin' as const,
        pluginId,
      }
    })
  }

  /**
   * 仅返回未禁用的工具（供 list/call）；外挂优先排序
   */
  private getEnabledTools(): McpTool[] {
    const list = this.disabledTools.size === 0
      ? this.tools
      : this.tools.filter(t => !this.disabledTools.has(t.name))
    return this.sortToolsForPresentation(list)
  }

  /**
   * 删除已安装外挂：卸载工具 + 删除 mcp_plugins/<id> 目录
   */
  async deleteInstalledPlugin(pluginId: string): Promise<{ removedTools: string[], deletedDir: boolean }> {
    if (!pluginId || pluginId.includes('/') || pluginId.includes('\\') || pluginId.includes('..')) {
      throw new Error('插件 id 非法')
    }

    const plugin = this.pluginRegistry.getPlugin(pluginId)
    if (!plugin) {
      throw new Error(`插件未加载或不存在: ${pluginId}`)
    }

    const removedTools = this.unloadPlugin(pluginId)

    // 清理禁用名单中已删除工具，避免脏数据
    if (removedTools.length > 0) {
      const removedSet = new Set(removedTools)
      const nextDisabled = this.getDisabledTools().filter(n => !removedSet.has(n))
      if (nextDisabled.length !== this.disabledTools.size) {
        this.setDisabledTools(nextDisabled)
      }
    }

    const pluginsDir = getMcpPluginsDir()
    const destDir = path.join(pluginsDir, pluginId)
    let deletedDir = false
    if (isPathInside(pluginsDir, destDir) && path.resolve(destDir) !== path.resolve(pluginsDir)) {
      if (await fs.pathExists(destDir)) {
        await fs.remove(destDir)
        deletedDir = true
      }
    }

    logger.info('已删除外挂插件', { pluginId, removedTools: removedTools.length, deletedDir })
    return { removedTools, deletedDir }
  }

  /**
   * 添加通用工具 + 外挂插件
   *
   * **重要**: 为了提升响应速度，我们把常用的工具放在前面，利用 Prompt Cache 的特性。
   * 策略：
   * 1. 备份现有工具列表
   * 2. 清空列表
   * 3. 添加常用工具（如音量控制、摄像头等）到前面
   * 4. 将原有工具追加到后面
   * 5. 加载外挂插件
   */
  async addCommonTools(): Promise<void> {
    logger.info('添加通用工具...')

    try {
      // 注入 McpContext，供工具使用（打破循环依赖）
      setMcpContext(this)

      // 创建并注入 timer / screenshot 运行时（无静态单例）
      const timerService = TimerService.create()
      const screenshotTool = ScreenshotTool.create()
      setMcpToolRuntime({
        musicPlayer: this.musicPlayer,
        timerService,
        screenshotTool,
      })

      // 备份原有工具列表
      const originalTools = [...this.tools]
      this.tools = []
      this.pluginRegistry.clear()

      // 注册系统工具（常用工具将被优先添加）；注入 MusicPlayer
      const systemManager = new SystemToolsManager(this.musicPlayer)
      await systemManager.init(
        this.addTool.bind(this),
        PropertyList,
        PropertyType,
      )

      // 将原有工具恢复到列表末尾
      this.tools.push(...originalTools)

      // 加载禁用列表
      this.loadDisabledToolsFromDb()

      // 加载外挂插件（失败隔离）
      await this.loadExternalPlugins()

      logger.info('工具注册完成', { totalTools: this.tools.length })
    }
    catch (error) {
      logger.error('添加通用工具失败', error)
    }
  }

  /**
   * 扫描并加载外挂插件
   */
  async loadExternalPlugins(): Promise<void> {
    try {
      let pluginsConfig = {
        enabled: true,
        disabledIds: [] as string[],
        enabledIds: [] as string[],
        allowHostGet: ['logger', 'config_readonly'] as McpHostGetKey[],
        enforcePrefix: false,
      }
      try {
        const dbCfg = getDatabase().getMcpPluginsConfig()
        pluginsConfig = {
          enabled: dbCfg.enabled,
          disabledIds: dbCfg.disabledIds,
          enabledIds: dbCfg.enabledIds,
          allowHostGet: dbCfg.allowHostGet.filter(
            (k): k is McpHostGetKey => k === 'logger' || k === 'config_readonly',
          ),
          enforcePrefix: dbCfg.enforcePrefix,
        }
      }
      catch (error) {
        logger.warn('读取外挂插件配置失败，使用默认', error)
      }

      const result = await loadMcpPluginsFromConfig({
        registry: this.pluginRegistry,
        addTool: tool => this.addTool(tool),
        removeToolsByNames: names => this.removeToolsByNames(names),
        config: pluginsConfig,
      })

      if (result.errors.length > 0) {
        logger.warn('部分外挂插件加载失败', { errors: result.errors })
      }
    }
    catch (error) {
      logger.error('加载外挂插件失败（不影响内置工具）', error)
    }
  }

  /**
   * 重新加载外挂：卸掉全部外挂工具后重新扫描
   */
  async reloadExternalPlugins(): Promise<void> {
    logger.info('重新加载外挂插件...')
    this.unloadAllExternalPlugins()
    await this.loadExternalPlugins()
    logger.info('外挂插件重载完成', { totalTools: this.tools.length })
  }

  /**
   * 解析 MCP 消息
   */
  async parseMessage(message: string | Record<string, unknown>): Promise<void> {
    let requestId: string | number | undefined
    try {
      const data: JsonRpcRequest
        = typeof message === 'string'
          ? JSON.parse(message) as JsonRpcRequest
          : message as unknown as JsonRpcRequest

      logger.debug('解析消息', data)

      requestId = data.id

      // 检查 JSONRPC 版本
      if (data.jsonrpc !== '2.0') {
        logger.error('JSONRPC 版本无效', { version: data.jsonrpc })
        return
      }

      const { method, id, params } = data

      if (!method) {
        logger.error('缺少 method 字段')
        return
      }

      // 忽略通知消息
      if (method.startsWith('notifications')) {
        logger.debug('忽略通知消息', { method })
        return
      }

      if (id === undefined) {
        logger.error('method 缺少 id', { method })
        return
      }

      logger.debug('处理方法', { method, id })

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
        logger.error('方法未实现', { method })
        await this.replyError(id, -32601, `Method not implemented: ${method}`)
      }
    }
    catch (error) {
      logger.error('解析消息失败', error)
      if (requestId !== undefined) {
        await this.replyError(requestId, -32603, String(error))
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
   * 处理 tools/list 请求（过滤 DISABLED）
   */
  private async handleToolsList(
    id: string | number,
    params?: Record<string, unknown>,
  ): Promise<void> {
    // 每次 list 刷新禁用列表，避免保存后未重载内存
    this.loadDisabledToolsFromDb()

    const cursor = (params?.cursor as string) || ''
    const maxPayloadSize = 8000

    const toolsJson: McpToolJson[] = []
    let totalSize = 0
    let foundCursor = !cursor
    let nextCursor = ''

    const enabledTools = this.getEnabledTools()

    for (const tool of enabledTools) {
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
   * 处理 tools/call 请求（DISABLED 工具拒绝调用）
   */
  private async handleToolCall(
    id: string | number,
    params?: Record<string, unknown>,
  ): Promise<void> {
    logger.info('收到工具调用请求', { id, params })

    const toolName = params?.name as string | undefined
    if (!toolName) {
      await this.replyError(id, -32602, 'Missing tool name')
      return
    }

    // 刷新并检查禁用
    this.loadDisabledToolsFromDb()
    if (this.disabledTools.has(toolName)) {
      await this.replyError(id, -32602, `Tool is disabled: ${toolName}`)
      return
    }

    logger.debug('尝试调用工具', { toolName })

    // 查找工具
    const tool = this.tools.find(t => t.name === toolName)
    if (!tool) {
      await this.replyError(id, -32602, `Unknown tool: ${toolName}`)
      return
    }

    // 获取参数
    const args = (params?.arguments as Record<string, unknown>) || {}

    logger.debug('开始执行工具', { toolName, args })

    // 调用工具
    try {
      const result = await this.callTool(tool, args)
      logger.info('工具执行成功', { toolName })
      await this.replyResult(id, JSON.parse(result))
    }
    catch (error) {
      logger.error('工具执行失败', error, { toolName })
      await this.replyError(id, -32603, String(error))
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
      logger.error('调用工具异常', error, { toolName: tool.name })
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
        const configManager = getConfigManager()
        const allConfig = configManager.getAll()

        const cameraOptions = {
          vlApiKey: allConfig.VLapi_key as string | undefined,
          vlUrl: allConfig.Local_VL_url as string | undefined,
          vlModel: allConfig.models as string | undefined,
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
          logger.info('Vision 服务已配置', { url })
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

    logger.debug('发送成功响应', { id })

    if (this.sendCallback) {
      await this.sendCallback(JSON.stringify(payload))
    }
    else {
      logger.error('发送回调未设置')
    }
  }

  /**
   * 发送错误响应
   */
  private async replyError(id: string | number, code: number, message: string): Promise<void> {
    const payload: JsonRpcResponse = {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message,
      },
    }

    logger.error('发送错误响应', { id, code, message })

    if (this.sendCallback) {
      await this.sendCallback(JSON.stringify(payload))
    }
  }

  /**
   * 设置图片广播回调
   * 由 McpPlugin 在 setup 时注入，用于将图片数据发送到 UIPlugin
   */
  setImageBroadcastCallback(callback: (imageBase64: string, sourceType: ImageSourceType) => void): void {
    this.imageBroadcastCallback = callback
    logger.info('图片广播回调已设置')
  }

  /**
   * 广播图片到 UI
   * 供 SystemToolsManager 等工具调用
   */
  broadcastImage(imageBase64: string, sourceType: ImageSourceType): void {
    if (this.imageBroadcastCallback) {
      this.imageBroadcastCallback(imageBase64, sourceType)
    }
    else {
      logger.warn('图片广播回调未设置，无法广播图片')
    }
  }

  /**
   * 设置主题广播回调
   * 由 McpPlugin 在 setup 时注入，用于将主题变更发送到 UIPlugin
   */
  setThemeBroadcastCallback(callback: (theme: 'light' | 'dark' | 'auto') => void): void {
    this.themeBroadcastCallback = callback
    logger.info('主题广播回调已设置')
  }

  /**
   * 广播主题到 UI
   * 供 SystemToolsManager 等工具调用
   */
  broadcastTheme(theme: 'light' | 'dark' | 'auto'): void {
    if (this.themeBroadcastCallback) {
      this.themeBroadcastCallback(theme)
    }
    else {
      logger.warn('主题广播回调未设置，无法广播主题')
    }
  }

  /**
   * 查找工具
   * 供 Timer 等工具调用
   */
  findTool(name: string): McpTool | undefined {
    if (this.disabledTools.has(name))
      return undefined
    return this.tools.find(t => t.name === name)
  }

  /**
   * 获取全部已注册工具（含禁用，诊断用）
   */
  getAllRegisteredTools(): McpTool[] {
    return [...this.tools]
  }
}
