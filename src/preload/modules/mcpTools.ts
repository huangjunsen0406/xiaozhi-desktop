import type {
  FileDialogResult,
  McpInstalledPlugin,
  McpPluginImportResult,
  McpPluginsConfigResult,
  McpPluginsHostConfig,
  McpToolCatalogItem,
  McpToolsMutationResult,
  McpToolsSaveResult,
} from '@shared/types'
import { invokeData, invokeVoid } from '../utils/ipc'

export const mcpToolsApi = {
  getInstalled: (): Promise<McpInstalledPlugin[]> =>
    invokeData('mcp-tools:get-installed', '获取已安装插件失败'),

  getCatalog: (): Promise<McpToolCatalogItem[]> =>
    invokeData('mcp-tools:get-catalog', '获取 MCP 工具列表失败'),

  getDisabled: (): Promise<string[]> =>
    invokeData('mcp-tools:get-disabled', '获取禁用列表失败'),

  saveDisabled: (disabledNames: string[], visibleNames?: string[]): Promise<McpToolsSaveResult> =>
    invokeData('mcp-tools:save-disabled', '保存 MCP 工具设置失败', disabledNames, visibleNames),

  selectFolder: (): Promise<FileDialogResult> =>
    invokeData('mcp-tools:select-folder', '选择插件文件夹失败'),

  selectZip: (): Promise<FileDialogResult> =>
    invokeData('mcp-tools:select-zip', '选择插件 ZIP 失败'),

  importPlugin: (sourcePath: string): Promise<McpPluginImportResult> =>
    invokeData('mcp-tools:import-plugin', '导入 MCP 插件失败', sourcePath),

  openFolder: (): Promise<void> =>
    invokeVoid('mcp-tools:open-folder', '打开插件目录失败'),

  getFolderPath: (): Promise<string> =>
    invokeData('mcp-tools:get-folder-path', '获取插件目录路径失败'),

  refresh: (): Promise<McpToolsMutationResult> =>
    invokeData('mcp-tools:refresh', '刷新 MCP 工具失败'),

  deletePlugin: (directoryName: string): Promise<McpToolsMutationResult> =>
    invokeData('mcp-tools:delete-plugin', '删除 MCP 插件失败', directoryName),

  getPluginsConfig: (): Promise<McpPluginsHostConfig> =>
    invokeData('mcp-tools:get-plugins-config', '获取外挂配置失败'),

  setPluginsConfig: (partial: Partial<McpPluginsHostConfig>): Promise<McpPluginsConfigResult> =>
    invokeData('mcp-tools:set-plugins-config', '保存外挂配置失败', partial),
}
