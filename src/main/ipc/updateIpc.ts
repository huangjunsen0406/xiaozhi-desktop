/**
 * 应用内更新 IPC（通道：update:*）
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
import { createIpcHandler, success } from './middleware'

const logger = getLogger('UpdateIpc')

export function registerUpdateIpc(): void {
  createIpcHandler({
    channel: 'update:get-status',
    handler: () => success(getUpdateStatus()),
  })

  createIpcHandler({
    channel: 'update:get-prefs',
    handler: () => success(getUpdatePrefs()),
  })

  createIpcHandler({
    channel: 'update:set-auto-check',
    schema: { enabled: { type: 'boolean', required: true } },
    handler: (_e, enabled: unknown) => success(setUpdateAutoCheck(Boolean(enabled))),
  })

  createIpcHandler({
    channel: 'update:check',
    handler: async () => success(await checkForUpdates({ silent: false })),
  })

  createIpcHandler({
    channel: 'update:download',
    handler: async () => {
      await downloadUpdate()
      return success(true)
    },
  })

  createIpcHandler({
    channel: 'update:quit-and-install',
    handler: () => {
      quitAndInstallUpdate()
      return success(true)
    },
  })

  createIpcHandler({
    channel: 'update:check-download-install',
    handler: () => {
      void checkDownloadInstallAndRestart().catch((error) => {
        logger.error('一键更新失败', error)
      })
      return success({ started: true })
    },
  })

  createIpcHandler({
    channel: 'update:skip-version',
    schema: { version: { type: 'string', required: true } },
    handler: (_e, version: unknown) => success(skipUpdateVersion(String(version || ''))),
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
