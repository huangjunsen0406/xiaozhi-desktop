/**
 * MCP 工具设置 API 模块
 */
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
import { ipcRenderer } from 'electron'
import { assertIpcSuccess, unwrapIpcResult } from '../utils/ipc'

export const mcpToolsApi = {
  getInstalled: async (): Promise<McpInstalledPlugin[]> => {
    const result: unknown = await ipcRenderer.invoke('mcp-tools:get-installed')
    return unwrapIpcResult<McpInstalledPlugin[]>(result, '获取已安装插件失败')
  },
  /** 获取统一工具 catalog（内置+外挂） */
  getCatalog: async (): Promise<McpToolCatalogItem[]> => {
    const result: unknown = await ipcRenderer.invoke('mcp-tools:get-catalog')
    return unwrapIpcResult<McpToolCatalogItem[]>(result, '获取 MCP 工具列表失败')
  },

  /** 获取禁用工具名列表 */
  getDisabled: async (): Promise<string[]> => {
    const result: unknown = await ipcRenderer.invoke('mcp-tools:get-disabled')
    return unwrapIpcResult<string[]>(result, '获取禁用列表失败')
  },

  /** 保存禁用列表 + 重连 */
  saveDisabled: async (disabledNames: string[], visibleNames?: string[]): Promise<McpToolsSaveResult> => {
    const result: unknown = await ipcRenderer.invoke('mcp-tools:save-disabled', disabledNames, visibleNames)
    return unwrapIpcResult<McpToolsSaveResult>(result, '保存 MCP 工具设置失败')
  },

  /** 选择插件文件夹 */
  selectFolder: async (): Promise<FileDialogResult> => {
    const result: unknown = await ipcRenderer.invoke('mcp-tools:select-folder')
    return unwrapIpcResult<FileDialogResult>(result, '选择插件文件夹失败')
  },

  /** 导入插件 */
  importPlugin: async (sourcePath: string): Promise<McpPluginImportResult> => {
    const result: unknown = await ipcRenderer.invoke('mcp-tools:import-plugin', sourcePath)
    return unwrapIpcResult<McpPluginImportResult>(result, '导入 MCP 插件失败')
  },

  /** 打开插件目录 */
  openFolder: async (): Promise<void> => {
    const result: unknown = await ipcRenderer.invoke('mcp-tools:open-folder')
    assertIpcSuccess(result, '打开插件目录失败')
  },

  /** 获取插件目录路径 */
  getFolderPath: async (): Promise<string> => {
    const result: unknown = await ipcRenderer.invoke('mcp-tools:get-folder-path')
    return unwrapIpcResult<string>(result, '获取插件目录路径失败')
  },

  /** 刷新（重载外挂 + catalog） */
  refresh: async (): Promise<McpToolsMutationResult> => {
    const result: unknown = await ipcRenderer.invoke('mcp-tools:refresh')
    return unwrapIpcResult<McpToolsMutationResult>(result, '刷新 MCP 工具失败')
  },

  /** 删除已导入外挂（卸工具 + 删目录），返回最新 catalog */
  deletePlugin: async (directoryName: string): Promise<McpToolsMutationResult> => {
    const result: unknown = await ipcRenderer.invoke('mcp-tools:delete-plugin', directoryName)
    return unwrapIpcResult<McpToolsMutationResult>(result, '删除 MCP 插件失败')
  },

  /** 读取外挂 Host 配置（allowHostGet 等） */
  getPluginsConfig: async (): Promise<McpPluginsHostConfig> => {
    const result: unknown = await ipcRenderer.invoke('mcp-tools:get-plugins-config')
    return unwrapIpcResult<McpPluginsHostConfig>(result, '获取外挂配置失败')
  },

  /**
   * 更新外挂 Host 配置并重载外挂。
   * 例如开放应用内播放：allowHostGet 含 media_player。
   */
  setPluginsConfig: async (
    partial: Partial<McpPluginsHostConfig>,
  ): Promise<McpPluginsConfigResult> => {
    const result: unknown = await ipcRenderer.invoke('mcp-tools:set-plugins-config', partial)
    return unwrapIpcResult<McpPluginsConfigResult>(result, '保存外挂配置失败')
  },
}
