/**
 * 延迟加载 sharp，避免启动协议 / 主进程入口被原生模块拖垮。
 *
 * 打包后缺 @img/sharp-<platform> 时，调用方应降级，而不是让 Electron 弹未捕获异常。
 *
 * 注意：主进程构建启用了 bytecodePlugin（.jsc 字节码，经 vm.Script 执行），
 * vm 执行字节码时不提供 dynamic import 回调，`await import('sharp')` 会抛
 * ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING（1.1.7 起安装版无法生成宠物预览的根因）。
 * 这里用同步 require 延迟加载，字节码环境完全支持；保持 async 签名兼容调用方。
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
