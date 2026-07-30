/**
 * MCP 工具 / 外挂插件 IPC
 *
 * 通道：mcp-tools:*
 * - 统一 catalog（内置+外挂）
 * - 导入插件 / 打开目录 / 刷新
 * - 保存 DISABLED + reconnectKeepingIdle
 */

import type { McpPluginImportResult, McpToolCatalogItem, McpToolsSaveResult } from '@shared/types'
import type { IpcMainInvokeEvent } from 'electron'
import path from 'node:path'
import { dialog, ipcMain, shell } from 'electron'
import fs from 'fs-extra'
import { getServiceContainer } from '../core/ServiceContainer'
import { readPluginManifest } from '../mcp/plugins'
import { getDatabase } from '../services/database'
import { reconnectIfConnectedKeepingIdle } from '../services/settingsApply'
import { getLogger } from '../utils/logger'
import { getMcpPluginsDir, isPathInside } from '../utils/paths'

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
  ipcMain.handle('mcp-tools:get-catalog', async (_event: IpcMainInvokeEvent) => {
    try {
      const server = getMcpServerOrThrow()
      const catalog: McpToolCatalogItem[] = server.getToolCatalog()
      return { success: true, data: catalog }
    }
    catch (error) {
      logger.error('获取 MCP catalog 失败', error)
      return { success: false, error: String(error) }
    }
  })

  /**
   * 获取当前禁用工具列表
   */
  ipcMain.handle('mcp-tools:get-disabled', async () => {
    try {
      const disabled = getDatabase().getMcpDisabledTools()
      return { success: true, data: disabled }
    }
    catch (error) {
      logger.error('获取禁用列表失败', error)
      return { success: false, error: String(error) }
    }
  })

  /**
   * 保存禁用列表并尝试 reconnectKeepingIdle
   */
  ipcMain.handle(
    'mcp-tools:save-disabled',
    async (_event: IpcMainInvokeEvent, disabledNames: string[]) => {
      try {
        if (!Array.isArray(disabledNames)) {
          return { success: false, error: 'disabledNames 必须是数组' }
        }

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
        return { success: true, data: result }
      }
      catch (error) {
        logger.error('保存禁用列表失败', error)
        return { success: false, error: String(error) }
      }
    },
  )

  /**
   * 选择插件文件夹
   */
  ipcMain.handle('mcp-tools:select-folder', async () => {
    return dialog.showOpenDialog({
      title: '选择 MCP 插件文件夹',
      properties: ['openDirectory'],
    })
  })

  /**
   * 导入插件：校验 manifest 后复制到 mcp_plugins/<id>/
   */
  ipcMain.handle(
    'mcp-tools:import-plugin',
    async (_event: IpcMainInvokeEvent, sourcePath: string) => {
      try {
        if (!sourcePath || typeof sourcePath !== 'string') {
          return { success: false, error: '无效的路径' }
        }

        const resolvedSource = path.resolve(sourcePath)
        if (!(await fs.pathExists(resolvedSource))) {
          return { success: false, error: '源目录不存在' }
        }

        const stat = await fs.stat(resolvedSource)
        if (!stat.isDirectory()) {
          return { success: false, error: '请选择插件目录（含 manifest.json）' }
        }

        const validated = await readPluginManifest(resolvedSource)
        if (!validated.ok) {
          return { success: false, error: validated.error }
        }

        const { manifest } = validated
        if (manifest.runtime !== 'node-inprocess') {
          return {
            success: false,
            error: `不支持的 runtime: ${manifest.runtime}（当前仅支持 node-inprocess）`,
          }
        }

        // 插件 id 禁止路径分隔与相对段，避免奇怪目录布局
        if (
          manifest.id.includes('/')
          || manifest.id.includes('\\')
          || manifest.id.includes('..')
          || path.isAbsolute(manifest.id)
        ) {
          return { success: false, error: '插件 id 非法（不能包含路径分隔符或 ..）' }
        }

        const pluginsDir = getMcpPluginsDir()
        const destDir = path.join(pluginsDir, manifest.id)

        // 安全：目标必须在 pluginsDir 内
        if (!isPathInside(pluginsDir, destDir) || path.resolve(destDir) === path.resolve(pluginsDir)) {
          return { success: false, error: '插件 id 导致路径逃逸' }
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
          return {
            success: false,
            error: `插件已复制到目录，但加载失败（请检查 entry / register 导出，并查看日志）。目标: ${destDir}`,
          }
        }

        const data: McpPluginImportResult = {
          pluginId: manifest.id,
          name: manifest.name,
        }
        logger.info('MCP 插件导入成功', data)
        return { success: true, data }
      }
      catch (error) {
        logger.error('导入 MCP 插件失败', error)
        return { success: false, error: String(error) }
      }
    },
  )

  /**
   * 打开插件目录
   */
  ipcMain.handle('mcp-tools:open-folder', async () => {
    try {
      const folderPath = getMcpPluginsDir()
      await fs.ensureDir(folderPath)
      await shell.openPath(folderPath)
      return { success: true }
    }
    catch (error) {
      logger.error('打开插件目录失败', error)
      return { success: false, error: String(error) }
    }
  })

  /**
   * 获取插件目录路径
   */
  ipcMain.handle('mcp-tools:get-folder-path', async () => {
    return getMcpPluginsDir()
  })

  /**
   * 刷新：重载外挂 + 返回最新 catalog
   */
  ipcMain.handle('mcp-tools:refresh', async () => {
    try {
      const server = getMcpServerOrThrow()
      await server.reloadExternalPlugins()
      const catalog: McpToolCatalogItem[] = server.getToolCatalog()
      return { success: true, data: catalog }
    }
    catch (error) {
      logger.error('刷新 MCP 工具失败', error)
      return { success: false, error: String(error) }
    }
  })

  /**
   * 删除已导入外挂：卸载工具 + 删除 mcp_plugins/<id>
   */
  ipcMain.handle(
    'mcp-tools:delete-plugin',
    async (_event: IpcMainInvokeEvent, pluginId: string) => {
      try {
        if (!pluginId || typeof pluginId !== 'string') {
          return { success: false, error: '无效的插件 id' }
        }
        const server = getMcpServerOrThrow()
        const result = await server.deleteInstalledPlugin(pluginId)
        const catalog: McpToolCatalogItem[] = server.getToolCatalog()
        return {
          success: true,
          data: {
            pluginId,
            removedTools: result.removedTools,
            deletedDir: result.deletedDir,
            catalog,
          },
        }
      }
      catch (error) {
        logger.error('删除 MCP 插件失败', error)
        return { success: false, error: String(error) }
      }
    },
  )

  logger.info('MCP 工具 IPC 处理器已注册')
}
