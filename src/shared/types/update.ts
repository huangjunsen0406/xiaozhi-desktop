/**
 * 应用内更新（electron-updater，对齐易翻产品流程）
 */

export type UpdateProgressPhase = 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'

export interface UpdateCheckResult {
  available: boolean
  currentVersion: string
  /** 远端版本；无更新时为空 */
  version: string
  releaseNotes: string
  /** 是否被用户忽略的版本 */
  skipped?: boolean
}

export interface UpdateDownloadProgress {
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
}

export interface UpdatePrefs {
  /** 启动时静默检查，默认 true */
  autoCheck: boolean
  /** 用户忽略的版本号 */
  skippedVersion: string
  /** 最近一次发现的可更新版本（角标/提示用） */
  availableVersion: string
}

export interface UpdateStatusSnapshot {
  currentVersion: string
  isPackaged: boolean
  prefs: UpdatePrefs
  lastCheck: UpdateCheckResult | null
  downloading: boolean
  downloadProgress: UpdateDownloadProgress | null
  updateDownloaded: boolean
  error: string | null
}
