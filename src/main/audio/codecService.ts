import { OpusCodec } from './OpusCodec'

let codec: OpusCodec | null = null

/** 音频插件启动时显式创建；设置服务仅重建已存在的编解码器。 */
export function initOpusCodec(): OpusCodec {
  codec ??= new OpusCodec()
  return codec
}

export function getOpusCodec(): OpusCodec | null {
  return codec
}

export function disposeOpusCodec(): void {
  codec?.destroy()
  codec = null
}
