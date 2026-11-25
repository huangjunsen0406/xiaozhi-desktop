import type {
  UpdateCheckResult,
  UpdateDownloadProgress,
  UpdatePrefs,
  UpdateStatusSnapshot,
} from '@shared/types'
import { invokeData, invokeVoid, subscribeChannel } from '../utils/ipc'

export const updateApi = {
  getStatus: (): Promise<UpdateStatusSnapshot> =>
    invokeData('update:get-status', '获取更新状态失败'),

  getPrefs: (): Promise<UpdatePrefs> =>
    invokeData('update:get-prefs', '获取更新偏好失败'),

  setAutoCheck: (enabled: boolean): Promise<UpdatePrefs> =>
    invokeData('update:set-auto-check', '设置自动检查失败', enabled),

  check: (): Promise<UpdateCheckResult> =>
    invokeData('update:check', '检查更新失败'),

  download: (): Promise<void> =>
    invokeVoid('update:download', '下载更新失败'),

  quitAndInstall: (): Promise<void> =>
    invokeVoid('update:quit-and-install', '安装更新失败'),

  checkDownloadInstall: (): Promise<void> =>
    invokeVoid('update:check-download-install', '启动更新失败'),

  skipVersion: (version: string): Promise<UpdatePrefs> =>
    invokeData('update:skip-version', '忽略版本失败', version),

  openReleases: (): Promise<void> =>
    invokeVoid('update:open-releases', '打开发布页失败'),

  openRepo: (): Promise<void> =>
    invokeVoid('update:open-repo', '打开仓库失败'),

  onAvailable: (cb: (info: UpdateCheckResult) => void): (() => void) =>
    subscribeChannel('update:available', cb),

  onNotAvailable: (cb: (info: UpdateCheckResult) => void): (() => void) =>
    subscribeChannel('update:not-available', cb),

  onDownloadProgress: (cb: (p: UpdateDownloadProgress) => void): (() => void) =>
    subscribeChannel('update:download-progress', cb),

  onDownloaded: (cb: (info: { version: string, currentVersion: string }) => void): (() => void) =>
    subscribeChannel('update:downloaded', cb),

  onError: (cb: (payload: { message: string }) => void): (() => void) =>
    subscribeChannel('update:error', cb),
}
