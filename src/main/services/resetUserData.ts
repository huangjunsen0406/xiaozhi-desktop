/**
 * 清除本地配置（userData）
 *
 * 配置不在安装目录：卸载重装清不掉 SQLite / keywords.txt。
 * 非法唤醒词会让 sherpa-onnx 原生 abort，表现为「改完词就打不开」。
 */

import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { app } from 'electron'
import { getLogger, shutdownLogger } from '../utils/logger'
import { getDefaultUserDataDir, getUserDataDir } from '../utils/paths'
import { setIsQuitting } from '../windows/windowManager'
import { resetDatabase } from './database'
import { stripResetDataArgs } from './resetDataFlag'

export {
  hasResetDataFlag,
  isResetDataArg,
  RESET_DATA_FLAG,
  stripResetDataArgs,
} from './resetDataFlag'

const logger = getLogger('ResetUserData')

let resettingUserData = false

/** before-quit 据此跳过 preventDefault，避免和清除流程抢退出 */
export function isResettingUserData(): boolean {
  return resettingUserData
}

/**
 * 启动参数要求尽早处理：此时可能还没 app.ready，userData 仍可用。
 */
export function getResetUserDataDir(): string {
  try {
    if (app.isReady())
      return getUserDataDir()
  }
  catch {
    // paths 在个别测试环境可能尚未绑定
  }
  try {
    return app.getPath('userData')
  }
  catch {
    return getDefaultUserDataDir()
  }
}

export interface ResetUserDataResult {
  ok: boolean
  userDataDir: string
  error?: string
}

/**
 * 删除整个 userData（含 xiaozhi.db、唤醒词、日志、模型缓存）。
 * 调用方须先关掉 DB / logger 文件句柄。
 */
export function resetUserDataDir(userDataDir = getResetUserDataDir()): ResetUserDataResult {
  const result: ResetUserDataResult = { ok: false, userDataDir }
  if (!userDataDir) {
    result.error = 'userData 路径为空'
    return result
  }

  logger.info('即将清除本地配置', { userDataDir })

  // 先清会卡死启动的配置（DB + keywords），再尝试整目录
  for (const name of ['data', 'wake-word-models']) {
    const target = path.join(userDataDir, name)
    try {
      if (existsSync(target))
        rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
    }
    catch (partialError) {
      logger.error('清除关键目录失败', { target, error: partialError })
    }
  }

  try {
    if (existsSync(userDataDir)) {
      rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
    }
    result.ok = true
    logger.info('本地配置已清除', { userDataDir })
  }
  catch (error) {
    result.error = error instanceof Error ? error.message : String(error)
    logger.error('整目录清除失败（关键配置已尽量删除）', { userDataDir, error })
    const dataLeft = existsSync(path.join(userDataDir, 'data'))
    result.ok = !dataLeft
  }

  return result
}

/**
 * 关掉 DB / 日志句柄后删除 userData，再 relaunch（去掉 --reset-data）。
 */
export async function resetUserDataAndRelaunch(): Promise<void> {
  resettingUserData = true
  setIsQuitting(true)
  try {
    const { getServiceContainer } = await import('../core/ServiceContainer')
    await getServiceContainer().shutdown()
  }
  catch {
    // 启动早期尚未创建容器
  }
  try {
    resetDatabase()
  }
  catch {
    // 启动早期 DB 可能尚未打开
  }
  try {
    await shutdownLogger()
  }
  catch {
    // 日志可能尚未初始化
  }
  const result = resetUserDataDir()
  console.info('[ResetUserData]', result)
  app.relaunch({ args: stripResetDataArgs(process.argv.slice(1)) })
  app.exit(0)
}
