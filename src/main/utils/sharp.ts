/**
 * 延迟加载 sharp，避免启动协议 / 主进程入口被原生模块拖垮。
 *
 * 打包后缺 @img/sharp-<platform> 时，调用方应降级，而不是让 Electron 弹未捕获异常。
 */
import type SharpType from 'sharp'
import { getLogger } from './logger'

const logger = getLogger('Sharp')

let sharpModule: typeof SharpType | undefined
let loadError: Error | null = null

export async function getSharp(): Promise<typeof SharpType> {
  if (sharpModule)
    return sharpModule
  if (loadError)
    throw loadError

  try {
    const mod = await import('sharp')
    sharpModule = (mod.default ?? mod) as typeof SharpType
    return sharpModule
  }
  catch (error) {
    loadError = error instanceof Error ? error : new Error(String(error))
    logger.error('加载 sharp 失败', loadError)
    throw loadError
  }
}
