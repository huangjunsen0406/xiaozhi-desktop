import { Buffer } from 'node:buffer'
import OpusScript from 'opusscript'
import { getLogger } from '../utils/logger'
import { AudioConfig } from './AudioConfig'

const logger = getLogger('OpusCodec')

/**
 * Opus 编解码器
 * 负责音频的编码和解码
 */
export class OpusCodec {
  private encoder: OpusScript
  private decoder: OpusScript

  constructor() {
    try {
      logger.info('开始初始化 OpusCodec (纯 JS 实现)...')

      // 创建 Opus 编码器 (16kHz, 单声道)
      logger.info(`创建编码器: ${AudioConfig.inputSampleRate}Hz, ${AudioConfig.channels}ch`)
      this.encoder = new OpusScript(
        AudioConfig.inputSampleRate,
        AudioConfig.channels,
        OpusScript.Application.VOIP,
      )
      logger.info('编码器创建成功')

      // 创建 Opus 解码器 (24kHz, 单声道)
      logger.info(`创建解码器: ${AudioConfig.outputSampleRate}Hz, ${AudioConfig.channels}ch`)
      this.decoder = new OpusScript(
        AudioConfig.outputSampleRate,
        AudioConfig.channels,
        OpusScript.Application.VOIP,
      )
      logger.info('解码器创建成功')

      logger.info('OpusCodec 初始化完成')
      logger.info(`编码器: ${AudioConfig.inputSampleRate}Hz, ${AudioConfig.channels}ch`)
      logger.info(`解码器: ${AudioConfig.outputSampleRate}Hz, ${AudioConfig.channels}ch`)
    }
    catch (error) {
      logger.error('OpusCodec 初始化失败:', error)
      throw error
    }
  }

  /**
   * 编码 PCM 数据为 Opus
   * @param pcmBuffer Int16Array PCM 数据 (320 samples)
   * @returns Opus 编码后的 Buffer
   */
  encode(pcmBuffer: Int16Array): Buffer {
    try {
      // 验证帧大小
      if (pcmBuffer.length !== AudioConfig.inputFrameSize) {
        logger.warn(`PCM 帧大小不正确: ${pcmBuffer.length}, 期望: ${AudioConfig.inputFrameSize}`)
      }

      // opusscript 需要 Buffer 类型
      const inputBuffer = Buffer.from(pcmBuffer.buffer, pcmBuffer.byteOffset, pcmBuffer.byteLength)

      // Opus 编码
      const opusFrame = this.encoder.encode(inputBuffer, AudioConfig.inputFrameSize)

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

  /**
   * 重建编解码器（配置更新时调用）
   * 用于动态更新采样率等参数
   */
  rebuild(): void {
    try {
      logger.info('开始重建 OpusCodec...')

      // 先创建新实例，确保都成功后再替换旧的（原子性）
      logger.info(`重建编码器: ${AudioConfig.inputSampleRate}Hz, ${AudioConfig.channels}ch`)
      const newEncoder = new OpusScript(
        AudioConfig.inputSampleRate,
        AudioConfig.channels,
        OpusScript.Application.VOIP,
      )

      logger.info(`重建解码器: ${AudioConfig.outputSampleRate}Hz, ${AudioConfig.channels}ch`)
      const newDecoder = new OpusScript(
        AudioConfig.outputSampleRate,
        AudioConfig.channels,
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
      logger.info(`编码器: ${AudioConfig.inputSampleRate}Hz, ${AudioConfig.channels}ch`)
      logger.info(`解码器: ${AudioConfig.outputSampleRate}Hz, ${AudioConfig.channels}ch`)
    }
    catch (error) {
      logger.error('OpusCodec 重建失败:', error)
      throw error
    }
  }
}
