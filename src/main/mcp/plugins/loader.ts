/**
 * MCP 外挂插件 Loader
 *
 * 扫描 getMcpPluginsDir() 下一层目录包：
 * 1. 读 manifest.json，校验 api_version / entry isPathInside
 * 2. 仅加载 runtime === node-inprocess
 * 3. 动态 import / createRequire → register(host)
 * 4. 单插件失败隔离
 */

import type { McpTool } from '../types'
import type { McpPluginRegistry } from './registry'
import type {
  LoadedMcpPlugin,
  McpPluginManifest,
  McpPluginRegister,
  McpPluginsLoadConfig,
} from './types'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import fs from 'fs-extra'
import { getLogger } from '../../utils/logger'
import { getMcpPluginsDir } from '../../utils/paths'
import { createMcpHost } from './host'
import { isPlatformAllowed, validateManifest } from './manifest'
import { DEFAULT_MCP_PLUGINS_LOAD_CONFIG } from './types'

/** 用于 CJS require 解析（兼容打包后无 import.meta 的场景） */
const nodeRequire = createRequire(__filename)

const logger = getLogger('McpPluginLoader')

export interface LoadPluginsOptions {
  registry: McpPluginRegistry
  /** 将工具注册进 McpServer */
  addTool: (tool: McpTool) => void
  /** 加载失败时回滚已 add 的工具名（可选） */
  removeToolsByNames?: (names: string[]) => void
  config?: Partial<McpPluginsLoadConfig>
  pluginsDir?: string
}

export interface LoadPluginsResult {
  loaded: LoadedMcpPlugin[]
  skipped: Array<{ id?: string, reason: string }>
  errors: Array<{ id?: string, error: string }>
}

function shouldLoadPlugin(
  id: string,
  config: McpPluginsLoadConfig,
  enabledByDefault: boolean,
): boolean {
  if (!config.enabled)
    return false
  if (config.disabledIds.includes(id))
    return false
  if (config.enabledIds.length > 0)
    return config.enabledIds.includes(id)
  return enabledByDefault
}

function extractRegister(mod: unknown): McpPluginRegister | null {
  if (typeof mod === 'function') {
    return mod as McpPluginRegister
  }
  if (mod && typeof mod === 'object') {
    const obj = mod as Record<string, unknown>
    if (typeof obj.register === 'function') {
      return obj.register as McpPluginRegister
    }
    if (typeof obj.default === 'function') {
      return obj.default as McpPluginRegister
    }
    if (obj.default && typeof obj.default === 'object') {
      const d = obj.default as Record<string, unknown>
      if (typeof d.register === 'function') {
        return d.register as McpPluginRegister
      }
    }
  }
  return null
}

/**
 * 动态加载 entry 模块，解析 register 导出
 * 优先 CJS require（userData 下常见），再 ESM import（pathToFileURL，兼容 Windows）
 */
async function loadRegisterFn(entryPath: string): Promise<McpPluginRegister> {
  // CJS（示例与多数投放为 CJS）
  try {
    try {
      const resolved = nodeRequire.resolve(entryPath)
      delete nodeRequire.cache[resolved]
    }
    catch {
      // ignore
    }
    const cjsMod = nodeRequire(entryPath)
    const fromCjs = extractRegister(cjsMod)
    if (fromCjs)
      return fromCjs
  }
  catch (cjsError) {
    logger.debug('CJS require 失败，尝试 ESM import', {
      entryPath,
      error: String(cjsError),
    })
  }

  // ESM
  const url = pathToFileURL(entryPath).href
  const mod = await import(`${url}?t=${Date.now()}`) as Record<string, unknown>
  const fromEsm = extractRegister(mod)
  if (fromEsm)
    return fromEsm

  throw new Error(`entry 未导出 register(host): ${entryPath}`)
}

async function loadOnePlugin(
  pluginRoot: string,
  options: LoadPluginsOptions,
  config: McpPluginsLoadConfig,
  result: LoadPluginsResult,
): Promise<void> {
  const manifestPath = path.join(pluginRoot, 'manifest.json')
  if (!(await fs.pathExists(manifestPath))) {
    result.skipped.push({ reason: `无 manifest.json: ${pluginRoot}` })
    return
  }

  let raw: unknown
  try {
    raw = await fs.readJson(manifestPath)
  }
  catch (error) {
    result.errors.push({
      error: `读取 manifest 失败: ${pluginRoot}: ${String(error)}`,
    })
    return
  }

  const validated = validateManifest(raw, pluginRoot)
  if (!validated.ok) {
    result.errors.push({ error: `${pluginRoot}: ${validated.error}` })
    return
  }

  const { manifest, entryPath } = validated
  const id = manifest.id

  if (!shouldLoadPlugin(id, config, manifest.enabled_by_default !== false)) {
    result.skipped.push({ id, reason: '已禁用或不在 enabled 列表' })
    return
  }

  if (manifest.runtime !== 'node-inprocess') {
    logger.warn('跳过非 node-inprocess 插件', {
      id,
      runtime: manifest.runtime,
    })
    result.skipped.push({
      id,
      reason: `runtime 不支持: ${manifest.runtime}（MVP 仅 node-inprocess）`,
    })
    return
  }

  if (!isPlatformAllowed(manifest.platforms)) {
    result.skipped.push({
      id,
      reason: `当前平台 ${process.platform} 不在 platforms 列表`,
    })
    return
  }

  if (!(await fs.pathExists(entryPath))) {
    result.errors.push({ id, error: `entry 文件不存在: ${entryPath}` })
    return
  }

  const registeredTools: string[] = []
  try {
    const host = createMcpHost({
      pluginId: id,
      allowHostGet: config.allowHostGet,
      toolNamePrefix: manifest.tool_name_prefix,
      enforcePrefix: config.enforcePrefix,
      callTimeoutMs: manifest.call_timeout_ms ?? 30_000,
      onAddTool: (tool) => {
        options.addTool(tool)
        registeredTools.push(tool.name)
        options.registry.recordTool(tool.name, id)
      },
    })

    // 先占位登记，register 过程中 recordTool 会追加
    const loaded: LoadedMcpPlugin = {
      id,
      name: manifest.name,
      version: manifest.version,
      rootDir: pluginRoot,
      entryPath,
      toolNames: registeredTools,
      callTimeoutMs: manifest.call_timeout_ms ?? 30_000,
      toolNamePrefix: manifest.tool_name_prefix,
    }
    options.registry.registerPlugin(loaded)

    const register = await loadRegisterFn(entryPath)
    await register(host)

    // 同步 toolNames（register 可能追加）
    loaded.toolNames = registeredTools.slice()
    const existing = options.registry.getPlugin(id)
    if (existing) {
      existing.toolNames = registeredTools.slice()
    }

    result.loaded.push(loaded)
    logger.info('外挂插件加载成功', {
      id,
      name: manifest.name,
      tools: registeredTools,
    })
  }
  catch (error) {
    // 失败隔离：卸掉半成品登记 + 已 add 的工具
    const partialNames = options.registry.unloadPlugin(id)
    const toRemove = partialNames.length > 0 ? partialNames : registeredTools
    if (toRemove.length > 0 && options.removeToolsByNames) {
      options.removeToolsByNames(toRemove)
    }
    const msg = error instanceof Error ? error.message : String(error)
    logger.error('外挂插件加载失败（已隔离）', { id, error: msg })
    result.errors.push({ id, error: msg })
  }
}

/**
 * 从配置扫描并加载外挂插件
 */
export async function loadMcpPluginsFromConfig(
  options: LoadPluginsOptions,
): Promise<LoadPluginsResult> {
  const config: McpPluginsLoadConfig = {
    ...DEFAULT_MCP_PLUGINS_LOAD_CONFIG,
    ...options.config,
  }

  const result: LoadPluginsResult = {
    loaded: [],
    skipped: [],
    errors: [],
  }

  if (!config.enabled) {
    logger.info('MCP 外挂插件总开关已关闭，跳过加载')
    return result
  }

  const pluginsDir = options.pluginsDir ?? getMcpPluginsDir()
  await fs.ensureDir(pluginsDir)

  let entries: string[]
  try {
    entries = await fs.readdir(pluginsDir)
  }
  catch (error) {
    logger.error('读取插件目录失败', error)
    result.errors.push({ error: `读取插件目录失败: ${String(error)}` })
    return result
  }

  for (const name of entries) {
    if (name.startsWith('.'))
      continue
    const full = path.join(pluginsDir, name)
    let stat
    try {
      stat = await fs.stat(full)
    }
    catch {
      continue
    }
    if (!stat.isDirectory())
      continue

    // 单插件 try 已在 loadOnePlugin 内隔离
    await loadOnePlugin(full, options, config, result)
  }

  logger.info('外挂插件扫描完成', {
    loaded: result.loaded.length,
    skipped: result.skipped.length,
    errors: result.errors.length,
  })

  return result
}

/**
 * 校验并读取某个目录的 manifest（导入前检查）
 */
export async function readPluginManifest(
  pluginRoot: string,
): Promise<{ ok: true, manifest: McpPluginManifest, entryPath: string } | { ok: false, error: string }> {
  const manifestPath = path.join(pluginRoot, 'manifest.json')
  if (!(await fs.pathExists(manifestPath))) {
    return { ok: false, error: '目录中缺少 manifest.json' }
  }
  try {
    const raw = await fs.readJson(manifestPath)
    return validateManifest(raw, pluginRoot)
  }
  catch (error) {
    return { ok: false, error: `读取 manifest 失败: ${String(error)}` }
  }
}
