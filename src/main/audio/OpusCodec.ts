import { Buffer } from 'node:buffer'
import OpusScript from 'opusscript'
import { getLogger } from '../utils/logger'
import { getAudioRuntime } from './AudioRuntime'

const logger = getLogger('OpusCodec')

/**
 * Opus 编解码器（参数仅通过 AudioRuntime 读取）
 */
export class OpusCodec {
  private encoder!: OpusScript
  private decoder!: OpusScript

  constructor() {
    logger.info('初始化 OpusCodec...')
    const { encoder, decoder } = this.createPair()
    this.encoder = encoder
    this.decoder = decoder
  }

  private createPair(): { encoder: OpusScript, decoder: OpusScript } {
    const runtime = getAudioRuntime()
    const encoder = new OpusScript(runtime.inputSampleRate, runtime.channels, OpusScript.Application.VOIP)
    const decoder = new OpusScript(runtime.outputSampleRate, runtime.channels, OpusScript.Application.VOIP)
    logger.info(`OpusCodec 就绪: in=${runtime.inputSampleRate}Hz out=${runtime.outputSampleRate}Hz ${runtime.channels}ch`)
    return { encoder, decoder }
  }

  encode(pcmBuffer: Int16Array): Buffer {
    const runtime = getAudioRuntime()
    if (pcmBuffer.length !== runtime.inputFrameSize) {
      logger.warn(`PCM 帧大小不正确: ${pcmBuffer.length}, 期望: ${runtime.inputFrameSize}`)
    }
    const inputBuffer = Buffer.from(pcmBuffer.buffer, pcmBuffer.byteOffset, pcmBuffer.byteLength)
    return Buffer.from(this.encoder.encode(inputBuffer, runtime.inputFrameSize))
  }

  decode(opusFrame: Buffer): Buffer {
    return Buffer.from(this.decoder.decode(opusFrame))
  }

  destroy(): void {
    this.encoder.delete?.()
    this.decoder.delete?.()
  }

  rebuild(): void {
    logger.info('重建 OpusCodec...')
    const { encoder: newEncoder, decoder: newDecoder } = this.createPair()
    const oldEncoder = this.encoder
    const oldDecoder = this.decoder
    this.encoder = newEncoder
    this.decoder = newDecoder
    try {
      oldEncoder.delete?.()
      oldDecoder.delete?.()
    }
    catch {
      // 旧实例清理失败不影响新实例使用
    }
  }
}
