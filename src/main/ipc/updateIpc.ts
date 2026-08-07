/**
 * 应用内更新 IPC
 * 通道：update:*
 */

import { shell } from 'electron'
import {
  checkDownloadInstallAndRestart,
  checkForUpdates,
  downloadUpdate,
  getReleasesUrl,
  getRepoUrl,
  getUpdatePrefs,
  getUpdateStatus,
  quitAndInstallUpdate,
  setUpdateAutoCheck,
  skipUpdateVersion,
} from '../services/UpdateService'
import { getLogger } from '../utils/logger'
import { createIpcHandler, failure, success } from './middleware'

const logger = getLogger('UpdateIpc')

export function registerUpdateIpc(): void {
  createIpcHandler({
    channel: 'update:get-status',
    handler: async () => success(getUpdateStatus()),
  })

  createIpcHandler({
    channel: 'update:get-prefs',
    handler: async () => success(getUpdatePrefs()),
  })

  createIpcHandler({
    channel: 'update:set-auto-check',
    schema: {
      enabled: { type: 'boolean', required: true },
    },
    handler: async (_e, enabled: unknown) => {
      return success(setUpdateAutoCheck(Boolean(enabled)))
    },
  })

  createIpcHandler({
    channel: 'update:check',
    handler: async () => {
      try {
        const result = await checkForUpdates({ silent: false })
        return success(result)
      }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return failure(message)
      }
    },
  })

  createIpcHandler({
    channel: 'update:download',
    handler: async () => {
      try {
        await downloadUpdate()
        return success(true)
      }
      catch (error) {
        return failure(error instanceof Error ? error.message : String(error))
      }
    },
  })

  createIpcHandler({
    channel: 'update:quit-and-install',
    handler: async () => {
      try {
        quitAndInstallUpdate()
        return success(true)
      }
      catch (error) {
        return failure(error instanceof Error ? error.message : String(error))
      }
    },
  })

  /**
   * 一键：检查 + 下载 + 安装重启（进度通过 update:download-progress 推送）
   */
  createIpcHandler({
    channel: 'update:check-download-install',
    handler: async () => {
      try {
        // 异步执行；进度 event 推送；完成会 quit
        void checkDownloadInstallAndRestart().catch((error) => {
          logger.error('一键更新失败', error)
        })
        return success({ started: true })
      }
      catch (error) {
        return failure(error instanceof Error ? error.message : String(error))
      }
    },
  })

  createIpcHandler({
    channel: 'update:skip-version',
    schema: {
      version: { type: 'string', required: true },
    },
    handler: async (_e, version: unknown) => {
      return success(skipUpdateVersion(String(version || '')))
    },
  })

  createIpcHandler({
    channel: 'update:open-releases',
    handler: async () => {
      await shell.openExternal(getReleasesUrl())
      return success(true)
    },
  })

  createIpcHandler({
    channel: 'update:open-repo',
    handler: async () => {
      await shell.openExternal(getRepoUrl())
      return success(true)
    },
  })

  logger.info('更新 IPC 已注册')
}
