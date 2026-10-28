/**
 * 延迟加载 sharp，避免启动协议 / 主进程入口被原生模块拖垮。
 *
 * 打包后缺 @img/sharp-<platform> 时，调用方应降级，而不是让 Electron 弹未捕获异常。
 *
 * 使用同步 require 延迟加载，保持 async 签名兼容调用方。
 */
import type SharpType from 'sharp'
import { createRequire } from 'node:module'
import { getLogger } from './logger'

const logger = getLogger('Sharp')

// main 构建输出为 CJS（__filename 可用），createRequire 让 TS 语法下也能同步 require
const require = createRequire(__filename)

let sharpModule: typeof SharpType | undefined
let loadError: Error | null = null

export async function getSharp(): Promise<typeof SharpType> {
  if (sharpModule)
    return sharpModule
  if (loadError)
    throw loadError

  try {
    sharpModule = require('sharp') as typeof SharpType
    return sharpModule
  }
  catch (error) {
    loadError = error instanceof Error ? error : new Error(String(error))
    logger.error('加载 sharp 失败', loadError)
    throw loadError
  }
}
