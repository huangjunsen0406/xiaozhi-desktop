/**
 * MCP 工具设置 API 模块
 */
import type {
  McpPluginImportResult,
  McpToolCatalogItem,
  McpToolsSaveResult,
} from '@shared/types'
import { ipcRenderer } from 'electron'
import { assertIpcSuccess, unwrapIpcResult } from '../utils/ipc'

export const mcpToolsApi = {
  /** 获取统一工具 catalog（内置+外挂） */
  getCatalog: async (): Promise<McpToolCatalogItem[]> => {
    const result = await ipcRenderer.invoke('mcp-tools:get-catalog')
    return unwrapIpcResult<McpToolCatalogItem[]>(result, '获取 MCP 工具列表失败')
  },

  /** 获取禁用工具名列表 */
  getDisabled: async (): Promise<string[]> => {
    const result = await ipcRenderer.invoke('mcp-tools:get-disabled')
    return unwrapIpcResult<string[]>(result, '获取禁用列表失败')
  },

  /** 保存禁用列表 + 重连 */
  saveDisabled: async (disabledNames: string[]): Promise<McpToolsSaveResult> => {
    const result = await ipcRenderer.invoke('mcp-tools:save-disabled', disabledNames)
    return unwrapIpcResult<McpToolsSaveResult>(result, '保存 MCP 工具设置失败')
  },

  /** 选择插件文件夹 */
  selectFolder: (): Promise<Electron.OpenDialogReturnValue> =>
    ipcRenderer.invoke('mcp-tools:select-folder'),

  /** 导入插件 */
  importPlugin: async (sourcePath: string): Promise<McpPluginImportResult> => {
    const result = await ipcRenderer.invoke('mcp-tools:import-plugin', sourcePath)
    return unwrapIpcResult<McpPluginImportResult>(result, '导入 MCP 插件失败')
  },

  /** 打开插件目录 */
  openFolder: async (): Promise<void> => {
    const result = await ipcRenderer.invoke('mcp-tools:open-folder') as { success: boolean, error?: string }
    assertIpcSuccess(result, '打开插件目录失败')
  },

  /** 获取插件目录路径 */
  getFolderPath: (): Promise<string> =>
    ipcRenderer.invoke('mcp-tools:get-folder-path'),

  /** 刷新（重载外挂 + catalog） */
  refresh: async (): Promise<McpToolCatalogItem[]> => {
    const result = await ipcRenderer.invoke('mcp-tools:refresh')
    return unwrapIpcResult<McpToolCatalogItem[]>(result, '刷新 MCP 工具失败')
  },

  /** 删除已导入外挂（卸工具 + 删目录），返回最新 catalog */
  deletePlugin: async (pluginId: string): Promise<McpToolCatalogItem[]> => {
    const result = await ipcRenderer.invoke('mcp-tools:delete-plugin', pluginId)
    const data = unwrapIpcResult<{ catalog: McpToolCatalogItem[] }>(result, '删除 MCP 插件失败')
    return data.catalog
  },
}
