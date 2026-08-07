/**
 * MCP 外挂插件模块导出
 */

export { createMcpHost } from './host'
export { loadMcpPluginsFromConfig, readPluginManifest } from './loader'
export { isPlatformAllowed, validateManifest } from './manifest'
export { createMediaPlayerFacade, validateMediaUrl } from './mediaPlayerFacade'
export { McpPluginRegistry } from './registry'
export {
  BUILTIN_TOOL_LABELS,
  deriveBuiltinToolGroup,
  deriveCatalogGroupKey,
  deriveToolGroup,
  getGroupLabel,
  getToolLabel,
  TOOL_GROUP_LABELS,
} from './toolLabels'
export type {
  LoadedMcpPlugin,
  McpHost,
  McpHostGetKey,
  McpPluginManifest,
  McpPluginRegister,
  McpPluginRuntime,
  McpPluginsLoadConfig,
  McpToolCatalogItem,
  MediaPlayerFacade,
  MediaPlayerPlayOptions,
  MediaPlayerResult,
  MediaPlayerStatus,
  PropDef,
  ToolDefLike,
} from './types'
export {
  DEFAULT_MCP_PLUGINS_LOAD_CONFIG,
  MCP_PLUGIN_API_VERSION,
} from './types'
