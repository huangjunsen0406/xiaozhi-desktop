/**
 * MCP 工具 / 外挂插件 IPC（createIpcHandler + IpcResult）
 *
 * 通道：mcp-tools:*
 * - 统一 catalog（内置+外挂）
 * - 导入插件 / 打开目录 / 刷新
 * - 保存 DISABLED + reconnectKeepingIdle
 */

import type {
  McpPluginImportResult,
  McpPluginsConfigResult,
  McpPluginsHostConfig,
  McpToolCatalogItem,
  McpToolsSaveResult,
} from '@shared/types'
import { dialog, shell } from 'electron'
import fs from 'fs-extra'
import { normalizeMcpHostCapabilities } from '../../shared/mcpCapabilities'
import { getServiceContainer } from '../core/ServiceContainer'
import { installMcpPlugin } from '../mcp/plugins/installer'
import { runMcpPluginOperation } from '../mcp/plugins/operations'
import { getDatabase } from '../services/database'
import { syncMcpTools } from '../services/mcpToolsSync'
import { getLogger } from '../utils/logger'
import { getMcpPluginsDir } from '../utils/paths'
import { createIpcHandler, failure, success } from './middleware'

const logger = getLogger('McpToolsIpc')

function getMcpServerOrThrow() {
  const container = getServiceContainer()
  const server = container.getMcpServer?.() ?? container.mcpServer
  if (!server) {
    throw new Error('McpServer 未初始化')
  }
  return server
}

export function registerMcpToolsIpc(): void {
  /**
   * 获取统一工具 catalog
   */
  createIpcHandler({
    channel: 'mcp-tools:get-catalog',
    handler: async () => {
      const server = getMcpServerOrThrow()
      const catalog: McpToolCatalogItem[] = server.getToolCatalog()
      return success(catalog)
    },
  })

  createIpcHandler({
    channel: 'mcp-tools:get-installed',
    handler: async () => runMcpPluginOperation(async () => success(await getMcpServerOrThrow().getInstalledPlugins())),
  })

  /**
   * 获取当前禁用工具列表
   */
  createIpcHandler({
    channel: 'mcp-tools:get-disabled',
    handler: async () => {
      const disabled = getDatabase().getMcpDisabledTools()
      return success(disabled)
    },
  })

  /**
   * 保存禁用列表并尝试 reconnectKeepingIdle
   */
  createIpcHandler({
    channel: 'mcp-tools:save-disabled',
    schema: {
      disabledNames: { type: 'array', required: true },
    },
    handler: async (_event, disabledNamesUnknown: unknown) => runMcpPluginOperation(async () => {
      if (!Array.isArray(disabledNamesUnknown)) {
        return failure('disabledNames 必须是数组')
      }
      const disabledNames = disabledNamesUnknown as string[]

      const server = getMcpServerOrThrow()
      server.setDisabledTools(disabledNames)

      const sync = await syncMcpTools()
      const result: McpToolsSaveResult = {
        disabled: server.getDisabledTools(),
        reconnected: sync.status === 'synced',
        sync,
      }
      logger.info('MCP 工具禁用列表已保存', result)
      return success(result)
    }),
  })

  /**
   * 选择插件文件夹
   */
  createIpcHandler({
    channel: 'mcp-tools:select-folder',
    handler: async () => {
      const dialogResult = await dialog.showOpenDialog({
        title: '选择 MCP 插件文件夹',
        properties: ['openDirectory'],
      })
      return success(dialogResult)
    },
  })

  /**
   * 导入插件：校验 manifest 后复制到 mcp_plugins/<id>/
   */
  createIpcHandler({
    channel: 'mcp-tools:import-plugin',
    schema: {
      sourcePath: { type: 'string', required: true, minLength: 1 },
    },
    handler: async (_event, sourcePathUnknown: unknown) => runMcpPluginOperation(async () => {
      const sourcePath = String(sourcePathUnknown)
      if (!sourcePath) {
        return failure('无效的路径')
      }

      const server = getMcpServerOrThrow()
      const installed = await installMcpPlugin({
        sourcePath,
        pluginsDir: getMcpPluginsDir(),
        unload: () => server.unloadAllExternalPlugins(),
        reload: () => server.reloadExternalPlugins(),
        isLoaded: (id, rootDir) => server.getPluginRegistry().getPlugin(id)?.rootDir === rootDir,
      })
      const data: McpPluginImportResult = { ...installed, sync: await syncMcpTools() }
      logger.info('MCP 插件导入成功', data)
      return success(data)
    }),
  })

  /**
   * 打开插件目录
   */
  createIpcHandler({
    channel: 'mcp-tools:open-folder',
    handler: async () => {
      const folderPath = getMcpPluginsDir()
      await fs.ensureDir(folderPath)
      await shell.openPath(folderPath)
      return success()
    },
  })

  /**
   * 获取插件目录路径
   */
  createIpcHandler({
    channel: 'mcp-tools:get-folder-path',
    handler: async () => {
      return success(getMcpPluginsDir())
    },
  })

  /**
   * 读取外挂 Host 配置（含 allowHostGet）
   */
  createIpcHandler({
    channel: 'mcp-tools:get-plugins-config',
    handler: async () => {
      const cfg = getDatabase().getMcpPluginsConfig()
      const data: McpPluginsConfigResult = {
        sync: await syncMcpTools(),
        enabled: cfg.enabled,
        disabledIds: cfg.disabledIds,
        enabledIds: cfg.enabledIds,
        allowHostGet: cfg.allowHostGet,
        enforcePrefix: cfg.enforcePrefix,
      }
      return success(data)
    },
  })

  /**
   * 更新外挂 Host 配置；可选重载外挂使 media_player 等立即生效
   */
  createIpcHandler({
    channel: 'mcp-tools:set-plugins-config',
    schema: {
      partial: { type: 'object', required: true },
    },
    handler: async (_event, partialUnknown: unknown) => runMcpPluginOperation(async () => {
      const partial = partialUnknown as Partial<McpPluginsHostConfig>
      if (!partial || typeof partial !== 'object') {
        return failure('无效的配置')
      }

      const toSave: Parameters<ReturnType<typeof getDatabase>['setMcpPluginsConfig']>[0] = {}
      if (typeof partial.enabled === 'boolean')
        toSave.enabled = partial.enabled
      if (Array.isArray(partial.disabledIds))
        toSave.disabledIds = partial.disabledIds.filter(x => typeof x === 'string')
      if (Array.isArray(partial.enabledIds))
        toSave.enabledIds = partial.enabledIds.filter(x => typeof x === 'string')
      if (typeof partial.enforcePrefix === 'boolean')
        toSave.enforcePrefix = partial.enforcePrefix
      if (Array.isArray(partial.allowHostGet)) {
        toSave.allowHostGet = normalizeMcpHostCapabilities(partial.allowHostGet)
      }

      getDatabase().setMcpPluginsConfig(toSave)

      // 重载外挂使 allowHostGet / capabilities 立即生效
      const server = getMcpServerOrThrow()
      await server.reloadExternalPlugins()
      const cfg = getDatabase().getMcpPluginsConfig()
      const data: McpPluginsConfigResult = {
        sync: await syncMcpTools(),
        enabled: cfg.enabled,
        disabledIds: cfg.disabledIds,
        enabledIds: cfg.enabledIds,
        allowHostGet: cfg.allowHostGet,
        enforcePrefix: cfg.enforcePrefix,
      }
      logger.info('MCP 外挂 Host 配置已更新并重载', {
        allowHostGet: data.allowHostGet,
      })
      return success(data)
    }),
  })

  /**
   * 刷新：重载外挂 + 返回最新 catalog
   */
  createIpcHandler({
    channel: 'mcp-tools:refresh',
    handler: async () => runMcpPluginOperation(async () => {
      const server = getMcpServerOrThrow()
      await server.reloadExternalPlugins()
      const catalog: McpToolCatalogItem[] = server.getToolCatalog()
      return success({ catalog, sync: await syncMcpTools() })
    }),
  })

  /**
   * 删除已导入外挂：卸载工具 + 删除 mcp_plugins/<id>
   */
  createIpcHandler({
    channel: 'mcp-tools:delete-plugin',
    schema: {
      directoryName: { type: 'string', required: true, minLength: 1 },
    },
    handler: async (_event, directoryNameUnknown: unknown) => runMcpPluginOperation(async () => {
      const directoryName = String(directoryNameUnknown)
      if (!directoryName) {
        return failure('无效的插件 id')
      }
      const server = getMcpServerOrThrow()
      const result = await server.deleteInstalledPlugin(directoryName)
      const catalog: McpToolCatalogItem[] = server.getToolCatalog()
      return success({
        directoryName,
        removedTools: result.removedTools,
        deletedDir: result.deletedDir,
        catalog,
        sync: await syncMcpTools(),
      })
    }),
  })

  logger.info('MCP 工具 IPC 处理器已注册')
}
