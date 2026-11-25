/**
 * 统一资源路径解析
 *
 * 默认：`app.getPath('userData')` 下现有布局；支持环境变量 `XIAOZHI_*_DIR` 覆盖。
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { app } from 'electron'

const log = {
  info: (...args: unknown[]) => console.info('[Paths]', ...args),
  error: (...args: unknown[]) => console.error('[Paths]', ...args),
}

export const ENV_DATA_DIR = 'XIAOZHI_DATA_DIR'
export const ENV_CACHE_DIR = 'XIAOZHI_CACHE_DIR'
export const ENV_LOG_DIR = 'XIAOZHI_LOG_DIR'
export const ENV_MUSIC_CACHE_DIR = 'XIAOZHI_MUSIC_CACHE_DIR'
export const ENV_MODELS_DIR = 'XIAOZHI_MODELS_DIR'
export const ENV_PETS_DIR = 'XIAOZHI_PETS_DIR'
export const ENV_EMOTIONS_DIR = 'XIAOZHI_EMOTIONS_DIR'
export const ENV_MCP_PLUGINS_DIR = 'XIAOZHI_MCP_PLUGINS_DIR'

function envPath(name: string): string | null {
  const raw = process.env[name]?.trim()
  return raw ? path.resolve(raw) : null
}

function ensureDir(dir: string): string {
  if (!existsSync(dir))
    mkdirSync(dir, { recursive: true })
  return dir
}

function resolveManagedDir(envName: string, fallback: () => string): string {
  return ensureDir(envPath(envName) ?? fallback())
}

export function isPathInside(parent: string, child: string): boolean {
  const resolvedParent = path.resolve(parent)
  const resolvedChild = path.resolve(child)
  if (resolvedChild === resolvedParent)
    return true
  const parentWithSep = resolvedParent.endsWith(path.sep)
    ? resolvedParent
    : resolvedParent + path.sep
  return resolvedChild.startsWith(parentWithSep)
}

export function getDefaultUserDataDir(): string {
  return app.getPath('userData')
}

export function getUserDataDir(): string {
  return resolveManagedDir(ENV_DATA_DIR, getDefaultUserDataDir)
}

export function getDataDir(): string {
  return ensureDir(path.join(getUserDataDir(), 'data'))
}

export function getDatabasePath(): string {
  return path.join(getDataDir(), 'xiaozhi.db')
}

export function getCacheDir(): string {
  return resolveManagedDir(ENV_CACHE_DIR, () => path.join(getUserDataDir(), 'cache'))
}

export function getLogDir(): string {
  return resolveManagedDir(ENV_LOG_DIR, () => path.join(getUserDataDir(), 'logs'))
}

export function getMusicCacheDir(): string {
  return resolveManagedDir(ENV_MUSIC_CACHE_DIR, () => path.join(getCacheDir(), 'music'))
}

export function getModelsDir(): string {
  return resolveManagedDir(ENV_MODELS_DIR, () => path.join(getUserDataDir(), 'models'))
}

export function getPetsDir(): string {
  return resolveManagedDir(ENV_PETS_DIR, () => path.join(getUserDataDir(), 'pets'))
}

export function getEmotionsDir(): string {
  return resolveManagedDir(ENV_EMOTIONS_DIR, () => path.join(getUserDataDir(), 'emotions'))
}

export function getMcpPluginsDir(): string {
  return resolveManagedDir(ENV_MCP_PLUGINS_DIR, () => path.join(getUserDataDir(), 'mcp_plugins'))
}

export function getWakeWordModelsBundledDir(): string {
  if (app.isPackaged)
    return path.join(process.resourcesPath, 'wake-word-models')

  const fromAppPath = path.join(app.getAppPath(), 'resources', 'wake-word-models')
  return existsSync(fromAppPath)
    ? fromAppPath
    : path.join(process.cwd(), 'resources', 'wake-word-models')
}

export function getWakeWordModelsUserDir(lang?: string): string {
  const base = path.join(getUserDataDir(), 'wake-word-models')
  return ensureDir(lang ? path.join(base, lang) : base)
}

export function getWakeWordKeywordsPath(lang: string): string {
  return path.join(getWakeWordModelsUserDir(lang), 'keywords.txt')
}

export function getDisplayModeFile(): string {
  return path.join(getUserDataDir(), 'display-mode.json')
}

export function getPetsConfigFile(): string {
  return path.join(getUserDataDir(), 'pets-config.json')
}

export function getCareRemindersConfigFile(): string {
  return path.join(getUserDataDir(), 'care-reminders.json')
}

export function resolveAllPaths(): Record<string, string> {
  return {
    userData: getUserDataDir(),
    data: getDataDir(),
    database: getDatabasePath(),
    cache: getCacheDir(),
    logs: getLogDir(),
    musicCache: getMusicCacheDir(),
    models: getModelsDir(),
    pets: getPetsDir(),
    emotions: getEmotionsDir(),
    mcpPlugins: getMcpPluginsDir(),
    wakeWordModelsBundled: getWakeWordModelsBundledDir(),
    wakeWordModelsUser: getWakeWordModelsUserDir(),
  }
}

export interface MigrateResult {
  ok: boolean
  src: string
  dst: string
  filesCopied: number
  skipped?: string
  error?: string
}

export function migrateDirectory(
  src: string,
  dst: string,
  options: { skipDirNames?: Set<string> } = {},
): MigrateResult {
  const srcResolved = path.resolve(src)
  const dstResolved = path.resolve(dst)
  const skip = options.skipDirNames ?? new Set<string>()
  const result: MigrateResult = {
    ok: false,
    src: srcResolved,
    dst: dstResolved,
    filesCopied: 0,
  }

  if (srcResolved === dstResolved) {
    return { ...result, ok: true, skipped: 'same_path' }
  }

  if (!existsSync(srcResolved) || !statSync(srcResolved).isDirectory()) {
    return { ...result, ok: true, skipped: 'src_missing' }
  }

  try {
    ensureDir(dstResolved)
    let count = 0

    const walk = (from: string, to: string, isTop: boolean): void => {
      for (const entry of readdirSync(from, { withFileTypes: true })) {
        if (isTop && skip.has(entry.name))
          continue
        const fromPath = path.join(from, entry.name)
        const toPath = path.join(to, entry.name)
        if (entry.isDirectory()) {
          ensureDir(toPath)
          walk(fromPath, toPath, false)
        }
        else if (entry.isFile() && !existsSync(toPath)) {
          ensureDir(path.dirname(toPath))
          copyFileSync(fromPath, toPath)
          count++
        }
      }
    }

    walk(srcResolved, dstResolved, true)
    result.filesCopied = count
    result.ok = true
    log.info('目录迁移完成', { src: srcResolved, dst: dstResolved, filesCopied: count })
  }
  catch (error) {
    result.error = error instanceof Error ? error.message : String(error)
    log.error('目录迁移失败', { src: srcResolved, dst: dstResolved, error })
  }

  return result
}

export function migrateFromEnvIfNeeded(): void {
  const defaultRoot = getDefaultUserDataDir()
  const targets: Array<{
    env: string
    srcSegments: string[]
    getDst: () => string
    skipDirNames?: () => Set<string> | undefined
  }> = [
    {
      env: ENV_CACHE_DIR,
      srcSegments: ['cache'],
      getDst: getCacheDir,
      skipDirNames: () => envPath(ENV_MUSIC_CACHE_DIR) ? new Set(['music']) : undefined,
    },
    { env: ENV_LOG_DIR, srcSegments: ['logs'], getDst: getLogDir },
    { env: ENV_MUSIC_CACHE_DIR, srcSegments: ['cache', 'music'], getDst: getMusicCacheDir },
    { env: ENV_MODELS_DIR, srcSegments: ['models'], getDst: getModelsDir },
    { env: ENV_PETS_DIR, srcSegments: ['pets'], getDst: getPetsDir },
    { env: ENV_EMOTIONS_DIR, srcSegments: ['emotions'], getDst: getEmotionsDir },
    { env: ENV_MCP_PLUGINS_DIR, srcSegments: ['mcp_plugins'], getDst: getMcpPluginsDir },
  ]

  for (const target of targets) {
    if (!envPath(target.env))
      continue
    migrateDirectory(path.join(defaultRoot, ...target.srcSegments), target.getDst(), {
      skipDirNames: target.skipDirNames?.(),
    })
  }
}
