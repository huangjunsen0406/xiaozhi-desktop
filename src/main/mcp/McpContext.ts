import type { MusicPlayer } from './tools/music/MusicPlayer'
import type { ScreenshotTool } from './tools/screenshot/ScreenshotTool'
import type { TimerService } from './tools/timer/TimerService'
import type { McpTool } from './types'

/**
 * MCP 上下文接口
 * 用于打破 McpServer ↔ SystemToolsManager 的循环依赖，
 * 并为 timer/screenshot/music 等工具提供运行时注入（禁止各工具 getInstance）。
 */
export interface McpContext {
  /** 获取 vision API 配置 */
  getVisionConfig: () => { url?: string, token?: string }
  /** 广播主题变更到 UI */
  broadcastTheme: (theme: 'light' | 'dark' | 'auto') => void
  /** 按名称查找已注册的 MCP 工具 */
  findTool: (name: string) => McpTool | undefined
}

/**
 * MCP 工具运行时（music / timer / screenshot 等共享实例）
 * 由 McpServer.addCommonTools / bindSharedServices 注入
 */
export interface McpToolRuntime {
  musicPlayer: MusicPlayer | null
  timerService: TimerService | null
  screenshotTool: ScreenshotTool | null
}

// 模块级引用，由 McpServer 在初始化时注入（非懒创建业务对象）
let _mcpContext: McpContext | null = null
let _toolRuntime: McpToolRuntime = {
  musicPlayer: null,
  timerService: null,
  screenshotTool: null,
}

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

/**
 * 注入工具运行时实例（addCommonTools / bindSharedServices）
 */
export function setMcpToolRuntime(partial: Partial<McpToolRuntime>): void {
  _toolRuntime = { ..._toolRuntime, ...partial }
}

/**
 * 读取工具运行时
 */
export function getMcpToolRuntime(): McpToolRuntime {
  return _toolRuntime
}

export function getMusicPlayerFromRuntime(): MusicPlayer {
  if (!_toolRuntime.musicPlayer) {
    throw new Error('MusicPlayer not available in McpToolRuntime. Ensure bindSharedServices ran before music tools.')
  }
  return _toolRuntime.musicPlayer
}

export function getTimerServiceFromRuntime(): TimerService {
  if (!_toolRuntime.timerService) {
    throw new Error('TimerService not available in McpToolRuntime. Ensure addCommonTools initialized timer.')
  }
  return _toolRuntime.timerService
}

export function getScreenshotToolFromRuntime(): ScreenshotTool {
  if (!_toolRuntime.screenshotTool) {
    throw new Error('ScreenshotTool not available in McpToolRuntime. Ensure addCommonTools initialized screenshot.')
  }
  return _toolRuntime.screenshotTool
}

/**
 * 清空上下文与运行时（测试 / unbind）
 */
export function resetMcpContext(): void {
  _mcpContext = null
  _toolRuntime = {
    musicPlayer: null,
    timerService: null,
    screenshotTool: null,
  }
}
