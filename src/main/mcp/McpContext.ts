import type { McpTool } from './types'

/**
 * MCP 上下文接口
 * 用于打破 McpServer ↔ SystemToolsManager 的循环依赖
 * SystemToolsManager 和 TimerService 通过此接口访问 McpServer 的功能，
 * 而不需要直接导入 McpServer
 */
export interface McpContext {
  /** 获取 vision API 配置 */
  getVisionConfig: () => { url?: string, token?: string }
  /** 广播主题变更到 UI */
  broadcastTheme: (theme: 'light' | 'dark' | 'auto') => void
  /** 按名称查找已注册的 MCP 工具 */
  findTool: (name: string) => McpTool | undefined
}

// 模块级单例，由 McpServer 在初始化时注入
let _mcpContext: McpContext | null = null

/**
 * 设置 MCP 上下文（由 McpServer 调用）
 */
export function setMcpContext(ctx: McpContext): void {
  _mcpContext = ctx
}

/**
 * 获取 MCP 上下文（供 SystemToolsManager / TimerService 使用）
 */
export function getMcpContext(): McpContext {
  if (!_mcpContext) {
    throw new Error('McpContext not initialized. Ensure McpServer has been set up before accessing McpContext.')
  }
  return _mcpContext
}
