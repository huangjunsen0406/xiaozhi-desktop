/**
 * MCP 工具设置页共享类型
 */

/** catalog 中单行工具 */
export interface McpToolCatalogItem {
  /** 工具全名，如 self.music.pause */
  name: string
  /** 中文展示名 */
  label: string
  /** 分组展示名（内置中文 / 外挂 manifest.name） */
  group: string
  /** 分组稳定 key：内置 domain 或外挂 pluginId，UI 按此归组 */
  groupKey: string
  /** 描述 */
  description: string
  /** 是否启用（非 DISABLED） */
  enabled: boolean
  /** 来源 */
  source: 'builtin' | 'plugin'
  /** 外挂插件 id */
  pluginId?: string
}

/** 保存禁用列表结果 */
export interface McpToolsSaveResult {
  disabled: string[]
  reconnected: boolean
  sync: McpToolsSyncResult
}

/** 导入插件结果 */
export interface McpPluginImportResult {
  pluginId: string
  name: string
  sync: McpToolsSyncResult
}

/** 外挂插件加载配置（设置页 / Host 白名单） */
export interface McpPluginsHostConfig {
  enabled: boolean
  disabledIds: string[]
  enabledIds: string[]
  /** host.get 白名单：logger / config_readonly / media_player / subtitle */
  allowHostGet: string[]
  enforcePrefix: boolean
}

/** Installed directory packages, including failed and zero-tool plugins. */
export interface McpInstalledPlugin {
  directoryName: string
  pluginId?: string
  name: string
  version?: string
  status: 'loaded' | 'skipped' | 'failed'
  toolCount: number
  reason?: string
}

export interface McpToolsSyncResult {
  status: 'synced' | 'deferred' | 'failed'
  error?: string
}

export interface McpToolsMutationResult {
  catalog: McpToolCatalogItem[]
  sync: McpToolsSyncResult
}

export interface McpPluginsConfigResult extends McpPluginsHostConfig {
  sync: McpToolsSyncResult
}
