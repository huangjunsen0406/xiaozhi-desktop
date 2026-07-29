/**
 * MCP 外挂插件类型（Host API v1）
 *
 * 运行时仅支持 node-inprocess；其它 runtime 由 loader 跳过并告警。
 */

import type { McpTool, PropertyList, ToolCallback } from '../types'

/** 支持的 Host API 版本 */
export const MCP_PLUGIN_API_VERSION = 1

/** MVP 支持的 runtime */
export type McpPluginRuntime = 'node-inprocess' | 'node-subprocess' | string

/** manifest.json 结构 */
export interface McpPluginManifest {
  id: string
  name: string
  version: string
  api_version: number
  runtime: McpPluginRuntime
  /** 相对插件根的 entry JS 路径 */
  entry: string
  /** 可选强制工具名前缀（enforce_prefix 时生效） */
  tool_name_prefix?: string
  enabled_by_default?: boolean
  call_timeout_ms?: number
  platforms?: string[]
  description?: string
}

/** 已加载插件记录 */
export interface LoadedMcpPlugin {
  id: string
  name: string
  version: string
  rootDir: string
  entryPath: string
  toolNames: string[]
  callTimeoutMs: number
  toolNamePrefix?: string
}

/** host.get 白名单键 */
export type McpHostGetKey = 'logger' | 'config_readonly'

/** 插件侧可传入的简化属性定义 */
export interface PropDef {
  name: string
  type: 'boolean' | 'integer' | 'number' | 'string'
  defaultValue?: unknown
  minValue?: number
  maxValue?: number
}

/** 类似 defineTool 的工具定义（插件可用） */
export interface ToolDefLike {
  name: string
  description: string
  properties?: PropertyList | PropDef[]
  callback: ToolCallback
}

/** McpHost 稳定契约（插件 register 入参） */
export interface McpHost {
  readonly pluginId: string
  addTool: (tool: McpTool | ToolDefLike) => void
  tool: (
    name: string,
    description: string,
    props?: PropDef[],
  ) => (fn: ToolCallback) => void
  get: (name: string) => unknown
}

/** register 函数签名 */
export type McpPluginRegister = (host: McpHost) => void | Promise<void>

/** 外挂加载配置 */
export interface McpPluginsLoadConfig {
  /** 总开关，默认 true */
  enabled: boolean
  /** 空 = 除 disabled 外全部加载 */
  enabledIds: string[]
  disabledIds: string[]
  /** host.get 白名单 */
  allowHostGet: McpHostGetKey[]
  /** 是否强制 tool_name_prefix */
  enforcePrefix: boolean
}

export const DEFAULT_MCP_PLUGINS_LOAD_CONFIG: McpPluginsLoadConfig = {
  enabled: true,
  enabledIds: [],
  disabledIds: [],
  allowHostGet: ['logger', 'config_readonly'],
  enforcePrefix: false,
}

/** 工具 catalog 行（设置页统一列表） */
export interface McpToolCatalogItem {
  name: string
  label: string
  /** 分组展示名（内置中文 / 外挂 manifest.name） */
  group: string
  /** 分组稳定 key：内置 domain 或外挂 pluginId */
  groupKey: string
  description: string
  enabled: boolean
  source: 'builtin' | 'plugin'
  pluginId?: string
}
