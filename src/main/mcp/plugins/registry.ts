/**
 * 外挂插件工具归属注册表
 *
 * 记录 toolName → pluginId，供 unload / catalog 归属使用。
 * 外挂工具只进 McpServer.addTool，不进 defineTool 全局表。
 */

import type { LoadedMcpPlugin } from './types'
import { getLogger } from '../../utils/logger'

const logger = getLogger('McpPluginRegistry')

export class McpPluginRegistry {
  private toolToPlugin = new Map<string, string>()
  private plugins = new Map<string, LoadedMcpPlugin>()

  registerPlugin(plugin: LoadedMcpPlugin): void {
    this.plugins.set(plugin.id, plugin)
    for (const name of plugin.toolNames) {
      this.toolToPlugin.set(name, plugin.id)
    }
    logger.info('已登记外挂插件', {
      id: plugin.id,
      tools: plugin.toolNames.length,
    })
  }

  recordTool(toolName: string, pluginId: string): void {
    this.toolToPlugin.set(toolName, pluginId)
    const plugin = this.plugins.get(pluginId)
    if (plugin && !plugin.toolNames.includes(toolName)) {
      plugin.toolNames.push(toolName)
    }
  }

  getPluginIdForTool(toolName: string): string | undefined {
    return this.toolToPlugin.get(toolName)
  }

  getPlugin(pluginId: string): LoadedMcpPlugin | undefined {
    return this.plugins.get(pluginId)
  }

  getAllPlugins(): LoadedMcpPlugin[] {
    return Array.from(this.plugins.values())
  }

  getToolNamesForPlugin(pluginId: string): string[] {
    return this.plugins.get(pluginId)?.toolNames.slice() ?? []
  }

  /**
   * 移除插件归属记录，返回该插件注册过的工具名
   */
  unloadPlugin(pluginId: string): string[] {
    const plugin = this.plugins.get(pluginId)
    if (!plugin) {
      return []
    }
    const names = plugin.toolNames.slice()
    for (const name of names) {
      this.toolToPlugin.delete(name)
    }
    this.plugins.delete(pluginId)
    logger.info('已卸载外挂插件登记', { id: pluginId, tools: names.length })
    return names
  }

  clear(): void {
    this.toolToPlugin.clear()
    this.plugins.clear()
  }

  isExternalTool(toolName: string): boolean {
    return this.toolToPlugin.has(toolName)
  }
}
