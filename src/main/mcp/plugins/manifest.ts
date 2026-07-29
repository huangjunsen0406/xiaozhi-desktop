/**
 * MCP 外挂 manifest 校验与路径解析
 */

import type { McpPluginManifest } from './types'
import path from 'node:path'
import process from 'node:process'
import { isPathInside } from '../../utils/paths'
import { MCP_PLUGIN_API_VERSION } from './types'

export interface ManifestValidationResult {
  ok: true
  manifest: McpPluginManifest
  entryPath: string
}

export interface ManifestValidationError {
  ok: false
  error: string
}

export type ManifestValidateResult = ManifestValidationResult | ManifestValidationError

/**
 * 校验原始 JSON 是否为合法 manifest，并解析 entry 绝对路径。
 * entry 必须位于 pluginRoot 内（isPathInside）。
 */
export function validateManifest(
  raw: unknown,
  pluginRoot: string,
): ManifestValidateResult {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'manifest 不是对象' }
  }

  const m = raw as Record<string, unknown>

  if (typeof m.id !== 'string' || !m.id.trim()) {
    return { ok: false, error: 'manifest.id 无效' }
  }
  if (typeof m.name !== 'string' || !m.name.trim()) {
    return { ok: false, error: 'manifest.name 无效' }
  }
  if (typeof m.version !== 'string' || !m.version.trim()) {
    return { ok: false, error: 'manifest.version 无效' }
  }

  const apiVersion = typeof m.api_version === 'number'
    ? m.api_version
    : Number(m.api_version)
  if (!Number.isFinite(apiVersion) || apiVersion !== MCP_PLUGIN_API_VERSION) {
    return {
      ok: false,
      error: `不支持的 api_version: ${String(m.api_version)}（需要 ${MCP_PLUGIN_API_VERSION}）`,
    }
  }

  if (typeof m.runtime !== 'string' || !m.runtime.trim()) {
    return { ok: false, error: 'manifest.runtime 无效' }
  }

  if (typeof m.entry !== 'string' || !m.entry.trim()) {
    return { ok: false, error: 'manifest.entry 无效' }
  }

  // entry 路径安全：resolve 后必须在插件根内
  const entryPath = path.resolve(pluginRoot, m.entry)
  if (!isPathInside(pluginRoot, entryPath)) {
    return {
      ok: false,
      error: `entry 路径逃逸插件目录: ${m.entry}`,
    }
  }

  const platforms = Array.isArray(m.platforms)
    ? m.platforms.filter((p): p is string => typeof p === 'string')
    : undefined

  const callTimeout = typeof m.call_timeout_ms === 'number' && m.call_timeout_ms > 0
    ? m.call_timeout_ms
    : 30_000

  const manifest: McpPluginManifest = {
    id: m.id.trim(),
    name: m.name.trim(),
    version: m.version.trim(),
    api_version: apiVersion,
    runtime: m.runtime.trim(),
    entry: m.entry.trim(),
    tool_name_prefix: typeof m.tool_name_prefix === 'string' ? m.tool_name_prefix : undefined,
    enabled_by_default: m.enabled_by_default !== false,
    call_timeout_ms: callTimeout,
    platforms,
    description: typeof m.description === 'string' ? m.description : undefined,
  }

  return { ok: true, manifest, entryPath }
}

/**
 * 判断当前平台是否被 manifest 允许
 */
export function isPlatformAllowed(
  platforms: string[] | undefined,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (!platforms || platforms.length === 0)
    return true
  return platforms.includes(platform)
}
