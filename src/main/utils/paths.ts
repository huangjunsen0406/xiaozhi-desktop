/**
 * 统一资源路径解析
 *
 * 默认：`app.getPath('userData')` 下现有布局（升级用户无感）。
 * 可覆盖：环境变量 `XIAOZHI_*_DIR` 优先，其次运行时 config PATHS 覆盖。
 *
 * 对齐 py-xiaozhi resource_finder：
 * - env 优先于 config
 * - 启动迁移 = 复制，不删源，跳过已存在目标文件
 * - data/config/DB 主目录策略谨慎（避免迁走正在打开的 DB）
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { app } from 'electron'

// 避免与 logger 循环依赖：paths 在 initLogger 前即可能被调用
const log = {
  info: (...args: unknown[]) => console.info('[Paths]', ...args),
  error: (...args: unknown[]) => console.error('[Paths]', ...args),
}

/** 环境变量名 */
export const ENV_DATA_DIR = 'XIAOZHI_DATA_DIR'
export const ENV_CACHE_DIR = 'XIAOZHI_CACHE_DIR'
export const ENV_LOG_DIR = 'XIAOZHI_LOG_DIR'
export const ENV_MUSIC_CACHE_DIR = 'XIAOZHI_MUSIC_CACHE_DIR'
export const ENV_MODELS_DIR = 'XIAOZHI_MODELS_DIR'
export const ENV_PETS_DIR = 'XIAOZHI_PETS_DIR'
export const ENV_EMOTIONS_DIR = 'XIAOZHI_EMOTIONS_DIR'
export const ENV_MCP_PLUGINS_DIR = 'XIAOZHI_MCP_PLUGINS_DIR'

/** 配置侧 PATHS 覆盖（运行时，env 优先） */
export interface PathsOverrides {
  cacheDir?: string
  logDir?: string
  musicCacheDir?: string
  modelsDir?: string
  petsDir?: string
  emotionsDir?: string
  mcpPluginsDir?: string
}

let overrides: PathsOverrides = {}

function envPath(name: string): string | null {
  const raw = process.env[name]?.trim()
  if (!raw)
    return null
  return path.resolve(raw)
}

function ensureDir(dir: string): string {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

/**
 * 判断 child 是否位于 parent 目录内（含自身）
 *
 * 使用 path.resolve + 分隔符边界，避免 `/models` 误匹配 `/models-evil`。
 */
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

/**
 * Electron 默认 userData 根（不经 env 覆盖）
 * 用于迁移源路径对比
 */
export function getDefaultUserDataDir(): string {
  return app.getPath('userData')
}

/**
 * 用户数据根目录
 *
 * 优先 XIAOZHI_DATA_DIR，否则 app.getPath('userData')。
 * 注意：DB 默认仍在此下的 data/；覆盖 DATA_DIR 时请在 app ready 尽早生效，
 * 且本模块不自动迁移正在打开的 SQLite。
 */
export function getUserDataDir(): string {
  const env = envPath(ENV_DATA_DIR)
  const dir = env ?? getDefaultUserDataDir()
  return ensureDir(dir)
}

/**
 * 数据库目录：{data}/data（与现网一致）
 * 不提供独立 env 覆盖，避免迁走打开中的 DB。
 */
export function getDataDir(): string {
  return ensureDir(path.join(getUserDataDir(), 'data'))
}

/**
 * 数据库文件路径
 */
export function getDatabasePath(): string {
  return path.join(getDataDir(), 'xiaozhi.db')
}

/**
 * 缓存目录：XIAOZHI_CACHE_DIR > PATHS.cacheDir > {userData}/cache
 */
export function getCacheDir(): string {
  const env = envPath(ENV_CACHE_DIR)
  if (env)
    return ensureDir(env)
  if (overrides.cacheDir)
    return ensureDir(path.resolve(overrides.cacheDir))
  return ensureDir(path.join(getUserDataDir(), 'cache'))
}

/**
 * 日志目录：XIAOZHI_LOG_DIR > PATHS.logDir > {userData}/logs
 */
export function getLogDir(): string {
  const env = envPath(ENV_LOG_DIR)
  if (env)
    return ensureDir(env)
  if (overrides.logDir)
    return ensureDir(path.resolve(overrides.logDir))
  return ensureDir(path.join(getUserDataDir(), 'logs'))
}

/**
 * 音乐缓存：XIAOZHI_MUSIC_CACHE_DIR > PATHS.musicCacheDir > {cache}/music
 */
export function getMusicCacheDir(): string {
  const env = envPath(ENV_MUSIC_CACHE_DIR)
  if (env)
    return ensureDir(env)
  if (overrides.musicCacheDir)
    return ensureDir(path.resolve(overrides.musicCacheDir))
  return ensureDir(path.join(getCacheDir(), 'music'))
}

/**
 * Live2D 模型：XIAOZHI_MODELS_DIR > PATHS.modelsDir > {userData}/models
 */
export function getModelsDir(): string {
  const env = envPath(ENV_MODELS_DIR)
  if (env)
    return ensureDir(env)
  if (overrides.modelsDir)
    return ensureDir(path.resolve(overrides.modelsDir))
  return ensureDir(path.join(getUserDataDir(), 'models'))
}

/**
 * 宠物资源：XIAOZHI_PETS_DIR > PATHS.petsDir > {userData}/pets
 */
export function getPetsDir(): string {
  const env = envPath(ENV_PETS_DIR)
  if (env)
    return ensureDir(env)
  if (overrides.petsDir)
    return ensureDir(path.resolve(overrides.petsDir))
  return ensureDir(path.join(getUserDataDir(), 'pets'))
}

/**
 * 表情资源：XIAOZHI_EMOTIONS_DIR > PATHS.emotionsDir > {userData}/emotions
 */
export function getEmotionsDir(): string {
  const env = envPath(ENV_EMOTIONS_DIR)
  if (env)
    return ensureDir(env)
  if (overrides.emotionsDir)
    return ensureDir(path.resolve(overrides.emotionsDir))
  return ensureDir(path.join(getUserDataDir(), 'emotions'))
}

/**
 * MCP 外挂插件目录
 * XIAOZHI_MCP_PLUGINS_DIR > PATHS.mcpPluginsDir > {userData}/mcp_plugins
 *
 * 由 mcp/plugins loader 扫描下一层目录包（manifest.json + entry JS）。
 */
export function getMcpPluginsDir(): string {
  const env = envPath(ENV_MCP_PLUGINS_DIR)
  if (env)
    return ensureDir(env)
  if (overrides.mcpPluginsDir)
    return ensureDir(path.resolve(overrides.mcpPluginsDir))
  return ensureDir(path.join(getUserDataDir(), 'mcp_plugins'))
}

/**
 * 显示模式配置文件（仍在 userData 根，与现网一致）
 */
export function getDisplayModeFile(): string {
  return path.join(getUserDataDir(), 'display-mode.json')
}

/**
 * 宠物配置文件
 */
export function getPetsConfigFile(): string {
  return path.join(getUserDataDir(), 'pets-config.json')
}

/**
 * 应用当前 PATHS 覆盖（env 仍优先）
 *
 * @param next 覆盖项（空字符串视为清除该项）
 * @param options 选项
 * @param options.migrate 是否从默认 userData 布局复制迁移
 */
export function applyPathOverrides(
  next: PathsOverrides,
  options: { migrate?: boolean } = {},
): void {
  const migrate = options.migrate === true
  const prev = { ...overrides }

  const cleaned: PathsOverrides = {}
  for (const [key, value] of Object.entries(next) as Array<[keyof PathsOverrides, string | undefined]>) {
    if (value && value.trim()) {
      cleaned[key] = value.trim()
    }
  }
  overrides = cleaned

  if (!migrate)
    return

  const defaultRoot = getDefaultUserDataDir()

  // cache
  if (cleaned.cacheDir || envPath(ENV_CACHE_DIR)) {
    const src = path.join(defaultRoot, 'cache')
    const dst = getCacheDir()
    // 若 music 已独立配置，迁移 cache 时跳过 music 子树
    const skipMusic = Boolean(cleaned.musicCacheDir || envPath(ENV_MUSIC_CACHE_DIR))
    migrateDirectory(src, dst, {
      skipDirNames: skipMusic ? new Set(['music']) : undefined,
    })
  }
  else if (prev.cacheDir) {
    // 覆盖被清除：无迁移
  }

  // logs
  if (cleaned.logDir || envPath(ENV_LOG_DIR)) {
    migrateDirectory(path.join(defaultRoot, 'logs'), getLogDir())
  }

  // music
  if (cleaned.musicCacheDir || envPath(ENV_MUSIC_CACHE_DIR)) {
    migrateDirectory(path.join(defaultRoot, 'cache', 'music'), getMusicCacheDir())
  }

  // models / pets / emotions
  if (cleaned.modelsDir || envPath(ENV_MODELS_DIR)) {
    migrateDirectory(path.join(defaultRoot, 'models'), getModelsDir())
  }
  if (cleaned.petsDir || envPath(ENV_PETS_DIR)) {
    migrateDirectory(path.join(defaultRoot, 'pets'), getPetsDir())
  }
  if (cleaned.emotionsDir || envPath(ENV_EMOTIONS_DIR)) {
    migrateDirectory(path.join(defaultRoot, 'emotions'), getEmotionsDir())
  }
  if (cleaned.mcpPluginsDir || envPath(ENV_MCP_PLUGINS_DIR)) {
    migrateDirectory(path.join(defaultRoot, 'mcp_plugins'), getMcpPluginsDir())
  }
}

/**
 * 读取当前生效的覆盖（不含 env）
 */
export function getPathOverrides(): PathsOverrides {
  return { ...overrides }
}

/**
 * 解析后的全部路径快照（调试 / 设置页）
 */
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

/**
 * 将旧目录内容复制到新目录（默认不删除源，安全）
 *
 * - 跳过已存在的目标文件
 * - skipDirNames：顶层目录名集合，整棵子树跳过
 */
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
    result.ok = true
    result.skipped = 'same_path'
    return result
  }

  if (!existsSync(srcResolved) || !statSync(srcResolved).isDirectory()) {
    result.ok = true
    result.skipped = 'src_missing'
    return result
  }

  try {
    ensureDir(dstResolved)
    let count = 0

    const walk = (from: string, to: string, isTop: boolean): void => {
      const entries = readdirSync(from, { withFileTypes: true })
      for (const entry of entries) {
        if (isTop && skip.has(entry.name)) {
          continue
        }
        const fromPath = path.join(from, entry.name)
        const toPath = path.join(to, entry.name)
        if (entry.isDirectory()) {
          ensureDir(toPath)
          walk(fromPath, toPath, false)
        }
        else if (entry.isFile()) {
          if (existsSync(toPath)) {
            continue
          }
          ensureDir(path.dirname(toPath))
          copyFileSync(fromPath, toPath)
          count++
        }
      }
    }

    walk(srcResolved, dstResolved, true)
    result.filesCopied = count
    result.ok = true
    log.info('目录迁移完成', {
      src: srcResolved,
      dst: dstResolved,
      filesCopied: count,
    })
  }
  catch (error) {
    result.error = error instanceof Error ? error.message : String(error)
    log.error('目录迁移失败', { src: srcResolved, dst: dstResolved, error })
  }

  return result
}

/**
 * 清除运行时覆盖（测试用）
 */
export function resetPathOverrides(): void {
  overrides = {}
}

/**
 * 启动时根据 env 执行一次默认→覆盖的复制迁移（若 env 指向非默认路径）
 *
 * 不迁移 data/DB。
 */
export function migrateFromEnvIfNeeded(): void {
  const defaultRoot = getDefaultUserDataDir()

  if (envPath(ENV_CACHE_DIR)) {
    const skipMusic = Boolean(envPath(ENV_MUSIC_CACHE_DIR))
    migrateDirectory(path.join(defaultRoot, 'cache'), getCacheDir(), {
      skipDirNames: skipMusic ? new Set(['music']) : undefined,
    })
  }
  if (envPath(ENV_LOG_DIR)) {
    migrateDirectory(path.join(defaultRoot, 'logs'), getLogDir())
  }
  if (envPath(ENV_MUSIC_CACHE_DIR)) {
    migrateDirectory(path.join(defaultRoot, 'cache', 'music'), getMusicCacheDir())
  }
  if (envPath(ENV_MODELS_DIR)) {
    migrateDirectory(path.join(defaultRoot, 'models'), getModelsDir())
  }
  if (envPath(ENV_PETS_DIR)) {
    migrateDirectory(path.join(defaultRoot, 'pets'), getPetsDir())
  }
  if (envPath(ENV_EMOTIONS_DIR)) {
    migrateDirectory(path.join(defaultRoot, 'emotions'), getEmotionsDir())
  }
  if (envPath(ENV_MCP_PLUGINS_DIR)) {
    migrateDirectory(path.join(defaultRoot, 'mcp_plugins'), getMcpPluginsDir())
  }
}
