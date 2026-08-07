/**
 * 应用内更新 API（preload）
 */
import type {
  UpdateCheckResult,
  UpdateDownloadProgress,
  UpdatePrefs,
  UpdateStatusSnapshot,
} from '@shared/types'
import { ipcRenderer } from 'electron'
import { assertIpcSuccess, unwrapIpcResult } from '../utils/ipc'

export const updateApi = {
  getStatus: async (): Promise<UpdateStatusSnapshot> => {
    const result: unknown = await ipcRenderer.invoke('update:get-status')
    return unwrapIpcResult<UpdateStatusSnapshot>(result, '获取更新状态失败')
  },

  getPrefs: async (): Promise<UpdatePrefs> => {
    const result: unknown = await ipcRenderer.invoke('update:get-prefs')
    return unwrapIpcResult<UpdatePrefs>(result, '获取更新偏好失败')
  },

  setAutoCheck: async (enabled: boolean): Promise<UpdatePrefs> => {
    const result: unknown = await ipcRenderer.invoke('update:set-auto-check', enabled)
    return unwrapIpcResult<UpdatePrefs>(result, '设置自动检查失败')
  },

  check: async (): Promise<UpdateCheckResult> => {
    const result: unknown = await ipcRenderer.invoke('update:check')
    return unwrapIpcResult<UpdateCheckResult>(result, '检查更新失败')
  },

  download: async (): Promise<void> => {
    const result: unknown = await ipcRenderer.invoke('update:download')
    assertIpcSuccess(result, '下载更新失败')
  },

  quitAndInstall: async (): Promise<void> => {
    const result: unknown = await ipcRenderer.invoke('update:quit-and-install')
    assertIpcSuccess(result, '安装更新失败')
  },

  /** 一键检查+下载+安装（进度走 onDownloadProgress） */
  checkDownloadInstall: async (): Promise<void> => {
    const result: unknown = await ipcRenderer.invoke('update:check-download-install')
    assertIpcSuccess(result, '启动更新失败')
  },

  skipVersion: async (version: string): Promise<UpdatePrefs> => {
    const result: unknown = await ipcRenderer.invoke('update:skip-version', version)
    return unwrapIpcResult<UpdatePrefs>(result, '忽略版本失败')
  },

  openReleases: async (): Promise<void> => {
    const result: unknown = await ipcRenderer.invoke('update:open-releases')
    assertIpcSuccess(result, '打开发布页失败')
  },

  openRepo: async (): Promise<void> => {
    const result: unknown = await ipcRenderer.invoke('update:open-repo')
    assertIpcSuccess(result, '打开仓库失败')
  },

  onAvailable: (cb: (info: UpdateCheckResult) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, info: UpdateCheckResult) => cb(info)
    ipcRenderer.on('update:available', handler)
    return () => ipcRenderer.off('update:available', handler)
  },

  onNotAvailable: (cb: (info: UpdateCheckResult) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, info: UpdateCheckResult) => cb(info)
    ipcRenderer.on('update:not-available', handler)
    return () => ipcRenderer.off('update:not-available', handler)
  },

  onDownloadProgress: (cb: (p: UpdateDownloadProgress) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, p: UpdateDownloadProgress) => cb(p)
    ipcRenderer.on('update:download-progress', handler)
    return () => ipcRenderer.off('update:download-progress', handler)
  },

  onDownloaded: (cb: (info: { version: string, currentVersion: string }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, info: { version: string, currentVersion: string }) => cb(info)
    ipcRenderer.on('update:downloaded', handler)
    return () => ipcRenderer.off('update:downloaded', handler)
  },

  onError: (cb: (payload: { message: string }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: { message: string }) => cb(payload)
    ipcRenderer.on('update:error', handler)
    return () => ipcRenderer.off('update:error', handler)
  },
}
