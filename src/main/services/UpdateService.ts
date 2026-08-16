/**
 * 应用内更新服务（electron-updater）
 *
 * 产品流程对齐易翻 / ccMesh：
 * - GitHub Releases 清单（app-update.yml / latest*.yml）
 * - 启动静默检查（可关）
 * - 设置页手动检查 / 下载安装 / 忽略版本
 * - 开发态（未打包）不发起真实检查
 */

import type {
  UpdateCheckResult,
  UpdateDownloadProgress,
  UpdatePrefs,
  UpdateStatusSnapshot,
} from '@shared/types'
import { extractReleaseNotes } from '@shared/releaseNotes'
import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { getLogger } from '../utils/logger'
import { setIsQuitting } from '../windows/windowManager'
import { getDatabase } from './database'

const logger = getLogger('UpdateService')

const META_AUTO_CHECK = 'update_auto_check'
const META_SKIPPED = 'update_skipped_version'
const META_AVAILABLE = 'update_available_version'

/** 源码仓（展示用） */
export const GITHUB_OWNER = 'huangjunsen0406'
export const GITHUB_SOURCE_REPO = 'xiaozhi-desktop'
/** 安装包与 latest*.yml 所在公仓（electron-updater 拉取） */
export const GITHUB_RELEASE_REPO = 'xiaozhi-desktop-release'
export const GITHUB_RELEASES_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_RELEASE_REPO}/releases`
/** 对外「发布页 / 官网」链接（设置 → 关于） */
export const APP_WEBSITE_URL = 'https://xiaozhi.junsen.online/'
export const GITHUB_SOURCE_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_SOURCE_REPO}`
/** 作者主页（设置 → 关于 · 作者链接） */
export const AUTHOR_HOME_URL = 'https://github.com/huangjunsen0406'

let initialized = false
let checking = false
let downloading = false
let updateDownloaded = false
let lastCheck: UpdateCheckResult | null = null
let lastError: string | null = null
let downloadProgress: UpdateDownloadProgress | null = null

/** downloadUpdate 与 update-downloaded 事件之间的桥接 */
let downloadFinishedResolve: (() => void) | null = null
let downloadFinishedReject: ((err: Error) => void) | null = null
let downloadFinishedPromise: Promise<void> | null = null

type ProgressListener = (p: UpdateDownloadProgress) => void
const progressListeners = new Set<ProgressListener>()

function beginDownloadWait(): Promise<void> {
  if (updateDownloaded)
    return Promise.resolve()
  if (downloadFinishedPromise)
    return downloadFinishedPromise
  downloadFinishedPromise = new Promise<void>((resolve, reject) => {
    downloadFinishedResolve = resolve
    downloadFinishedReject = reject
  })
  return downloadFinishedPromise
}

function settleDownloadWait(error?: Error): void {
  if (error) {
    downloadFinishedReject?.(error)
  }
  else {
    downloadFinishedResolve?.()
  }
  downloadFinishedResolve = null
  downloadFinishedReject = null
  downloadFinishedPromise = null
}

function readPrefs(): UpdatePrefs {
  try {
    const db = getDatabase()
    const autoRaw = db.getSchemaMeta(META_AUTO_CHECK)
    const autoCheck = autoRaw === null ? true : autoRaw !== '0' && autoRaw !== 'false'
    return {
      autoCheck,
      skippedVersion: db.getSchemaMeta(META_SKIPPED) || '',
      availableVersion: db.getSchemaMeta(META_AVAILABLE) || '',
    }
  }
  catch {
    return { autoCheck: true, skippedVersion: '', availableVersion: '' }
  }
}

function writeMeta(key: string, value: string): void {
  try {
    getDatabase().setSchemaMeta(key, value)
  }
  catch (error) {
    logger.warn('写入更新偏好失败', { key, error })
  }
}

function broadcast(channel: string, payload?: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed())
      continue
    try {
      win.webContents.send(channel, payload)
    }
    catch {
      // ignore
    }
  }
}

function mapError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error)
  if (/Could not fetch|net::|ENOTFOUND|ECONNREFUSED|timed out|unable to connect/i.test(msg)) {
    return '检查更新失败：网络不可用或无法访问更新源（GitHub）'
  }
  return `更新失败：${msg}`
}

/**
 * 在 app ready + DB 初始化后调用一次
 */
export function initUpdateService(): void {
  if (initialized)
    return
  initialized = true

  // 未打包：不挂 updater 事件，避免 dev 误请求
  if (!app.isPackaged) {
    logger.info('开发态跳过 electron-updater 初始化')
    return
  }

  try {
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    // 允许降级测试时可开；生产保持 false
    autoUpdater.allowDowngrade = false
    autoUpdater.logger = {
      info: (...args: unknown[]) => logger.info(String(args[0] ?? ''), args[1]),
      warn: (...args: unknown[]) => logger.warn(String(args[0] ?? ''), args[1]),
      error: (...args: unknown[]) => logger.error(String(args[0] ?? ''), args[1]),
      debug: (...args: unknown[]) => logger.debug(String(args[0] ?? ''), args[1]),
    } as Partial<Console> as Console

    // 打包产物内 app-update.yml 由 electron-builder 根据 publish 生成；
    // 这里再显式声明 GitHub，避免 yml 缺失时完全不可用
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: GITHUB_OWNER,
      repo: GITHUB_RELEASE_REPO,
    })

    autoUpdater.on('checking-for-update', () => {
      logger.info('正在检查更新…')
      lastError = null
    })

    autoUpdater.on('update-available', (info) => {
      logger.info('发现新版本', { version: info.version })
      writeMeta(META_AVAILABLE, info.version)
      const result: UpdateCheckResult = {
        available: true,
        currentVersion: app.getVersion(),
        version: info.version,
        releaseNotes: extractReleaseNotes(info.releaseNotes),
      }
      lastCheck = result
      broadcast('update:available', result)
    })

    autoUpdater.on('update-not-available', (info) => {
      logger.info('已是最新', { version: info.version })
      writeMeta(META_AVAILABLE, '')
      lastCheck = {
        available: false,
        currentVersion: app.getVersion(),
        version: info.version || app.getVersion(),
        releaseNotes: '',
      }
      broadcast('update:not-available', lastCheck)
    })

    autoUpdater.on('download-progress', (p) => {
      downloadProgress = {
        percent: p.percent,
        bytesPerSecond: p.bytesPerSecond,
        transferred: p.transferred,
        total: p.total,
      }
      for (const fn of progressListeners)
        fn(downloadProgress)
      broadcast('update:download-progress', downloadProgress)
    })

    autoUpdater.on('update-downloaded', (info) => {
      logger.info('更新包已下载', { version: info.version })
      downloading = false
      updateDownloaded = true
      downloadProgress = null
      settleDownloadWait()
      broadcast('update:downloaded', {
        version: info.version,
        currentVersion: app.getVersion(),
      })
    })

    autoUpdater.on('error', (err) => {
      checking = false
      downloading = false
      lastError = mapError(err)
      logger.error('updater error', err)
      settleDownloadWait(new Error(lastError))
      broadcast('update:error', { message: lastError })
    })

    logger.info('UpdateService 已初始化', { version: app.getVersion() })
  }
  catch (error) {
    logger.error('UpdateService 初始化失败', error)
  }
}

export function getUpdatePrefs(): UpdatePrefs {
  return readPrefs()
}

export function setUpdateAutoCheck(enabled: boolean): UpdatePrefs {
  writeMeta(META_AUTO_CHECK, enabled ? '1' : '0')
  return readPrefs()
}

export function skipUpdateVersion(version: string): UpdatePrefs {
  writeMeta(META_SKIPPED, version || '')
  writeMeta(META_AVAILABLE, '')
  if (lastCheck && lastCheck.version === version) {
    lastCheck = { ...lastCheck, available: false, skipped: true }
  }
  return readPrefs()
}

export function clearSkippedVersion(): UpdatePrefs {
  writeMeta(META_SKIPPED, '')
  return readPrefs()
}

export function getUpdateStatus(): UpdateStatusSnapshot {
  return {
    currentVersion: app.getVersion(),
    isPackaged: app.isPackaged,
    prefs: readPrefs(),
    lastCheck,
    downloading,
    downloadProgress,
    updateDownloaded,
    error: lastError,
  }
}

/**
 * 检查更新。packaged 下走 electron-updater；开发态返回 not available。
 */
export async function checkForUpdates(options?: { silent?: boolean }): Promise<UpdateCheckResult> {
  const silent = options?.silent === true
  const currentVersion = app.getVersion()

  if (!app.isPackaged) {
    const result: UpdateCheckResult = {
      available: false,
      currentVersion,
      version: '',
      releaseNotes: '',
    }
    lastCheck = result
    if (!silent)
      logger.info('开发态不检查远程更新')
    return result
  }

  if (checking) {
    return lastCheck || {
      available: false,
      currentVersion,
      version: '',
      releaseNotes: '',
    }
  }

  checking = true
  lastError = null

  try {
    const result = await autoUpdater.checkForUpdates()
    const info = result?.updateInfo
    const remote = (info?.version || '').replace(/^v/i, '')
    const current = currentVersion.replace(/^v/i, '')
    const prefs = readPrefs()

    const notes = extractReleaseNotes(info?.releaseNotes)

    if (remote && isRemoteNewer(current, remote)) {
      if (prefs.skippedVersion && prefs.skippedVersion === remote) {
        const skipped: UpdateCheckResult = {
          available: false,
          currentVersion,
          version: remote,
          releaseNotes: notes,
          skipped: true,
        }
        lastCheck = skipped
        writeMeta(META_AVAILABLE, '')
        return skipped
      }
      writeMeta(META_AVAILABLE, remote)
      lastCheck = {
        available: true,
        currentVersion,
        version: remote,
        releaseNotes: notes,
      }
      return lastCheck
    }

    writeMeta(META_AVAILABLE, '')
    lastCheck = {
      available: false,
      currentVersion,
      version: remote || currentVersion,
      releaseNotes: '',
    }
    return lastCheck
  }
  catch (error) {
    lastError = mapError(error)
    if (!silent)
      logger.error('检查更新失败', error)
    throw new Error(lastError)
  }
  finally {
    checking = false
  }
}

/** 粗略 semver 比较：a < b → true */
function isRemoteNewer(current: string, remote: string): boolean {
  const parse = (v: string) =>
    v.replace(/^v/i, '').split(/[.+-]/).map(p => Number.parseInt(p, 10) || 0)
  const a = parse(current)
  const b = parse(remote)
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) {
    const x = a[i] || 0
    const y = b[i] || 0
    if (y > x)
      return true
    if (y < x)
      return false
  }
  return false
}

/**
 * 下载已检查到的更新包（resolve 表示已触发下载；完整完成见 waitDownloadFinished）
 */
export async function downloadUpdate(): Promise<void> {
  if (!app.isPackaged)
    throw new Error('开发态无法下载更新')
  if (updateDownloaded)
    return
  if (downloading)
    return

  downloading = true
  lastError = null
  beginDownloadWait()
  try {
    await autoUpdater.downloadUpdate()
  }
  catch (error) {
    downloading = false
    lastError = mapError(error)
    settleDownloadWait(new Error(lastError))
    throw new Error(lastError)
  }
}

/**
 * 等待 update-downloaded（或 error）
 */
export async function waitDownloadFinished(timeoutMs = 30 * 60 * 1000): Promise<void> {
  if (updateDownloaded)
    return
  const wait = beginDownloadWait()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      wait,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('下载超时或未完成')), timeoutMs)
      }),
    ])
  }
  finally {
    if (timer)
      clearTimeout(timer)
  }
}

/**
 * 退出并安装（需已 download 完成）
 */
export function quitAndInstallUpdate(): void {
  if (!app.isPackaged)
    throw new Error('开发态无法安装更新')
  if (!updateDownloaded) {
    throw new Error('更新包尚未下载完成')
  }
  // 与窗口 close→hide 逻辑配合：先标记退出
  setIsQuitting(true)
  autoUpdater.quitAndInstall(false, true)
}

/**
 * 检查 → 下载 → 安装重启（设置页一键）
 */
export async function checkDownloadInstallAndRestart(
  onProgress?: ProgressListener,
): Promise<void> {
  if (onProgress)
    progressListeners.add(onProgress)
  try {
    const check = await checkForUpdates()
    if (!check.available)
      throw new Error(check.skipped ? `已忽略版本 v${check.version}` : '当前已是最新版本')

    await downloadUpdate()
    await waitDownloadFinished()
    quitAndInstallUpdate()
  }
  finally {
    if (onProgress)
      progressListeners.delete(onProgress)
  }
}

/**
 * 启动后静默检查（有更新才广播 / 写 available）
 */
export function scheduleSilentUpdateCheck(delayMs = 5000): void {
  setTimeout(() => {
    void (async () => {
      try {
        if (!app.isPackaged)
          return
        const prefs = readPrefs()
        if (!prefs.autoCheck)
          return
        const result = await checkForUpdates({ silent: true })
        if (!result.available)
          return
        if (prefs.skippedVersion && prefs.skippedVersion === result.version)
          return
        broadcast('update:available', result)
        logger.info('静默检查：发现新版本', { version: result.version })
      }
      catch (error) {
        logger.debug('静默检查更新失败（忽略）', error)
      }
    })()
  }, delayMs)
}

export function getReleasesUrl(): string {
  return APP_WEBSITE_URL
}

export function getRepoUrl(): string {
  return AUTHOR_HOME_URL
}
