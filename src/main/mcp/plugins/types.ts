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

/**
 * host.get 白名单键
 * - logger / config_readonly：默认开放
 * - media_player：应用内媒体播放 SDK（需配置显式加入；支持本地文件 / http(s) / HLS(m3u8)）
 * - bubble：字幕/消息条展示 SDK（需配置显式加入；复用关怀气泡通道，不进聊天历史）
 * - subtitle：bubble 别名（语义化命名，跨端插件兼容）
 */
export type McpHostGetKey = 'logger' | 'config_readonly' | 'media_player' | 'bubble' | 'subtitle'

/** 媒体播放 SDK 操作结果 */
export interface MediaPlayerResult {
  success: boolean
  message?: string
}

/** 媒体播放 SDK 状态（瘦视图，不含搜歌等） */
export interface MediaPlayerStatus {
  state: 'idle' | 'loading' | 'playing' | 'paused' | 'stopped' | 'error'
  url?: string | null
  title?: string | null
  currentTime?: number
  duration?: number
  volume?: number
  error?: string
}

export interface MediaPlayerPlayOptions {
  title?: string
  /** 起始位置（秒） */
  startPosition?: number
}

/**
 * 外挂可用的应用内媒体播放 SDK（Host capability）
 * 实现复用主进程 MusicPlayer → 后台窗 HTMLAudio（HLS 走 hls.js），
 * 不暴露搜歌/内部 IPC。playUrl 支持本地绝对路径 / http(s) / m3u8。
 */
export interface MediaPlayerFacade {
  playUrl: (url: string, opts?: MediaPlayerPlayOptions) => Promise<MediaPlayerResult>
  pause: () => Promise<MediaPlayerResult>
  resume: () => Promise<MediaPlayerResult>
  stop: () => Promise<MediaPlayerResult>
  seek: (positionSec: number) => Promise<MediaPlayerResult>
  getStatus: () => Promise<MediaPlayerStatus>
}

/** 字幕/消息条 SDK 操作结果 */
export interface BubbleResult {
  success: boolean
  message?: string
}

export interface BubbleShowOptions {
  /** 展示时长 ms，默认 5000 */
  durationMs?: number
}

/**
 * 外挂可用的字幕/消息条展示 SDK（Host capability: bubble / subtitle）
 * 复用关怀气泡通道（bubble:show-local → BubbleView），不进聊天历史、只做展示；
 * 依赖 pets / live2d 模式（桌宠 surface），无 surface 时返回明确错误。
 */
export interface BubbleFacade {
  show: (text: string, opts?: BubbleShowOptions) => Promise<BubbleResult>
  hide: () => Promise<BubbleResult>
}

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
