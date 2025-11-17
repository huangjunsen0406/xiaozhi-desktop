import { OpusCodec } from '../audio/OpusCodec'

// Opus 编解码器实例
let opusCodec: OpusCodec | null = null

/**
 * 初始化 OpusCodec (供 AudioPlugin 调用)
 */
export function initOpusCodec(): OpusCodec {
  if (!opusCodec) {
    console.log('[Audio IPC] 创建 OpusCodec...')
    opusCodec = new OpusCodec()
  }
  return opusCodec
}

/**
 * 注册音频相关的 IPC 通道
 */
export function registerAudioIpc(): void {
  console.log('[Audio IPC] 注册音频 IPC 通道...')
  // PCM 数据的处理已经移到 AudioPlugin 中
  console.log('[Audio IPC] 音频 IPC 通道已注册')
}

/**
 * 获取 OpusCodec 实例 (供其他模块使用)
 */
export function getOpusCodec(): OpusCodec | null {
  return opusCodec
}
