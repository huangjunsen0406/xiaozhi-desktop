/**
 * MCP 工具 / 外挂插件 IPC（createIpcHandler + IpcResult）
 *
 * 通道：mcp-tools:*
 * - 统一 catalog（内置+外挂）
 * - 导入插件 / 打开目录 / 刷新
 * - 保存 DISABLED + reconnectKeepingIdle
 */

import type { McpPluginImportResult, McpToolCatalogItem, McpToolsSaveResult } from '@shared/types'
import path from 'node:path'
import { dialog, shell } from 'electron'
import fs from 'fs-extra'
import { getServiceContainer } from '../core/ServiceContainer'
import { readPluginManifest } from '../mcp/plugins'
import { getDatabase } from '../services/database'
import { reconnectIfConnectedKeepingIdle } from '../services/settingsApply'
import { getLogger } from '../utils/logger'
import { getMcpPluginsDir, isPathInside } from '../utils/paths'
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
    handler: async (_event, disabledNamesUnknown: unknown) => {
      if (!Array.isArray(disabledNamesUnknown)) {
        return failure('disabledNames 必须是数组')
      }
      const disabledNames = disabledNamesUnknown as string[]

      const server = getMcpServerOrThrow()
      server.setDisabledTools(disabledNames)

      let reconnected = false
      try {
        // 工具集进 hello：已连接时 idle 重连；未连接仅 reload 配置
        reconnected = await reconnectIfConnectedKeepingIdle()
      }
      catch (reconnectError) {
        logger.warn('保存后重连失败（禁用列表已落盘）', reconnectError)
        reconnected = false
      }

      const result: McpToolsSaveResult = {
        disabled: server.getDisabledTools(),
        reconnected,
      }
      logger.info('MCP 工具禁用列表已保存', result)
      return success(result)
    },
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
    handler: async (_event, sourcePathUnknown: unknown) => {
      const sourcePath = String(sourcePathUnknown)
      if (!sourcePath) {
        return failure('无效的路径')
      }

      const resolvedSource = path.resolve(sourcePath)
      if (!(await fs.pathExists(resolvedSource))) {
        return failure('源目录不存在')
      }

      const stat = await fs.stat(resolvedSource)
      if (!stat.isDirectory()) {
        return failure('请选择插件目录（含 manifest.json）')
      }

      const validated = await readPluginManifest(resolvedSource)
      if (!validated.ok) {
        return failure(validated.error)
      }

      const { manifest } = validated
      if (manifest.runtime !== 'node-inprocess') {
        return failure(`不支持的 runtime: ${manifest.runtime}（当前仅支持 node-inprocess）`)
      }

      // 插件 id 禁止路径分隔与相对段，避免奇怪目录布局
      if (
        manifest.id.includes('/')
        || manifest.id.includes('\\')
        || manifest.id.includes('..')
        || path.isAbsolute(manifest.id)
      ) {
        return failure('插件 id 非法（不能包含路径分隔符或 ..）')
      }

      const pluginsDir = getMcpPluginsDir()
      const destDir = path.join(pluginsDir, manifest.id)

      // 安全：目标必须在 pluginsDir 内
      if (!isPathInside(pluginsDir, destDir) || path.resolve(destDir) === path.resolve(pluginsDir)) {
        return failure('插件 id 导致路径逃逸')
      }

      // 若源已在目标目录内，视为已安装，仍触发 reload
      if (path.resolve(resolvedSource) !== path.resolve(destDir)) {
        await fs.ensureDir(pluginsDir)
        if (await fs.pathExists(destDir)) {
          // 覆盖更新：先删后拷（插件包整体替换）
          await fs.remove(destDir)
        }
        await fs.copy(resolvedSource, destDir, {
          overwrite: true,
          errorOnExist: false,
          filter: (src) => {
            const base = path.basename(src)
            // 跳过 VCS；保留 node_modules（插件可自带依赖）与源码目录
            if (base === '.git' || base === '.svn' || base === '.hg')
              return false
            return true
          },
        })
      }

      // 重载外挂
      const server = getMcpServerOrThrow()
      await server.reloadExternalPlugins()

      // 导入后确认插件是否真正登记成功（拷贝成功 ≠ 加载成功）
      const loaded = server.getPluginRegistry().getPlugin(manifest.id)
      if (!loaded) {
        return failure(
          `插件已复制到目录，但加载失败（请检查 entry / register 导出，并查看日志）。目标: ${destDir}`,
        )
      }

      const data: McpPluginImportResult = {
        pluginId: manifest.id,
        name: manifest.name,
      }
      logger.info('MCP 插件导入成功', data)
      return success(data)
    },
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
   * 刷新：重载外挂 + 返回最新 catalog
   */
  createIpcHandler({
    channel: 'mcp-tools:refresh',
    handler: async () => {
      const server = getMcpServerOrThrow()
      await server.reloadExternalPlugins()
      const catalog: McpToolCatalogItem[] = server.getToolCatalog()
      return success(catalog)
    },
  })

  /**
   * 删除已导入外挂：卸载工具 + 删除 mcp_plugins/<id>
   */
  createIpcHandler({
    channel: 'mcp-tools:delete-plugin',
    schema: {
      pluginId: { type: 'string', required: true, minLength: 1 },
    },
    handler: async (_event, pluginIdUnknown: unknown) => {
      const pluginId = String(pluginIdUnknown)
      if (!pluginId) {
        return failure('无效的插件 id')
      }
      const server = getMcpServerOrThrow()
      const result = await server.deleteInstalledPlugin(pluginId)
      const catalog: McpToolCatalogItem[] = server.getToolCatalog()
      return success({
        pluginId,
        removedTools: result.removedTools,
        deletedDir: result.deletedDir,
        catalog,
      })
    },
  })

  logger.info('MCP 工具 IPC 处理器已注册')
}
