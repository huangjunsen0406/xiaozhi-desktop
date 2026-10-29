import { Buffer } from 'node:buffer'
import OpusScript from 'opusscript'
import { getLogger } from '../utils/logger'
import { getAudioRuntime } from './AudioRuntime'

const logger = getLogger('OpusCodec')

/**
 * Opus 编解码器
 * 负责音频的编码和解码；参数只通过 AudioRuntime 读取
 */
export class OpusCodec {
  private encoder: OpusScript
  private decoder: OpusScript

  constructor() {
    try {
      logger.info('开始初始化 OpusCodec (纯 JS 实现)...')
      const runtime = getAudioRuntime()

      // 创建 Opus 编码器
      logger.info(`创建编码器: ${runtime.inputSampleRate}Hz, ${runtime.channels}ch`)
      this.encoder = new OpusScript(
        runtime.inputSampleRate,
        runtime.channels,
        OpusScript.Application.VOIP,
      )
      logger.info('编码器创建成功')

      // 创建 Opus 解码器
      logger.info(`创建解码器: ${runtime.outputSampleRate}Hz, ${runtime.channels}ch`)
      this.decoder = new OpusScript(
        runtime.outputSampleRate,
        runtime.channels,
        OpusScript.Application.VOIP,
      )
      logger.info('解码器创建成功')

      logger.info('OpusCodec 初始化完成')
      logger.info(`编码器: ${runtime.inputSampleRate}Hz, ${runtime.channels}ch`)
      logger.info(`解码器: ${runtime.outputSampleRate}Hz, ${runtime.channels}ch`)
    }
    catch (error) {
      logger.error('OpusCodec 初始化失败:', error)
      throw error
    }
  }

  /**
   * 编码 PCM 数据为 Opus
   * @param pcmBuffer Int16Array PCM 数据
   * @returns Opus 编码后的 Buffer
   */
  encode(pcmBuffer: Int16Array): Buffer {
    try {
      const runtime = getAudioRuntime()
      // 验证帧大小
      if (pcmBuffer.length !== runtime.inputFrameSize) {
        logger.warn(`PCM 帧大小不正确: ${pcmBuffer.length}, 期望: ${runtime.inputFrameSize}`)
      }

      // opusscript 需要 Buffer 类型
      const inputBuffer = Buffer.from(pcmBuffer.buffer, pcmBuffer.byteOffset, pcmBuffer.byteLength)

      // Opus 编码
      const opusFrame = this.encoder.encode(inputBuffer, runtime.inputFrameSize)

      return Buffer.from(opusFrame)
    }
    catch (error) {
      logger.error('Opus 编码失败:', error)
      throw error
    }
  }

  /**
   * 解码 Opus 数据为 PCM
   * @param opusFrame Opus 编码的 Buffer
   * @returns Int16 PCM Buffer
   */
  decode(opusFrame: Buffer): Buffer {
    try {
      // Opus 解码
      const pcmBuffer = this.decoder.decode(opusFrame)

      return Buffer.from(pcmBuffer)
    }
    catch (error) {
      logger.error('Opus 解码失败:', error)
      throw error
    }
  }

  destroy(): void {
    this.encoder.delete?.()
    this.decoder.delete?.()
  }

  /**
   * 重建编解码器（配置更新时调用）
   * 用于动态更新采样率等参数；调用前应先 getAudioRuntime().reload()
   */
  rebuild(): void {
    try {
      logger.info('开始重建 OpusCodec...')
      const runtime = getAudioRuntime()

      // 先创建新实例，确保都成功后再替换旧的（原子性）
      logger.info(`重建编码器: ${runtime.inputSampleRate}Hz, ${runtime.channels}ch`)
      const newEncoder = new OpusScript(
        runtime.inputSampleRate,
        runtime.channels,
        OpusScript.Application.VOIP,
      )

      logger.info(`重建解码器: ${runtime.outputSampleRate}Hz, ${runtime.channels}ch`)
      const newDecoder = new OpusScript(
        runtime.outputSampleRate,
        runtime.channels,
        OpusScript.Application.VOIP,
      )

      // 保存旧实例引用用于清理
      const oldEncoder = this.encoder
      const oldDecoder = this.decoder

      // 替换为新实例
      this.encoder = newEncoder
      this.decoder = newDecoder

      // 清理旧实例
      try {
        oldEncoder.delete?.()
        oldDecoder.delete?.()
      }
      catch {
        // 旧实例清理失败不影响新实例使用
      }

      logger.info('OpusCodec 重建完成')
      logger.info(`编码器: ${runtime.inputSampleRate}Hz, ${runtime.channels}ch`)
      logger.info(`解码器: ${runtime.outputSampleRate}Hz, ${runtime.channels}ch`)
    }
    catch (error) {
      logger.error('OpusCodec 重建失败:', error)
      throw error
    }
  }
}
