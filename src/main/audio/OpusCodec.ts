import { Buffer } from 'node:buffer'
import OpusScript from 'opusscript'
import { AudioConfig } from '../constants/DeviceState'
import { createLogger } from '../utils/logger'

const logger = createLogger('OpusCodec')

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
      logger.info(`创建编码器: ${AudioConfig.INPUT_SAMPLE_RATE}Hz, ${AudioConfig.CHANNELS}ch`)
      this.encoder = new OpusScript(
        AudioConfig.INPUT_SAMPLE_RATE as any,
        AudioConfig.CHANNELS as any,
        OpusScript.Application.VOIP,
      )
      logger.info('编码器创建成功')

      // 创建 Opus 解码器 (24kHz, 单声道)
      logger.info(`创建解码器: ${AudioConfig.OUTPUT_SAMPLE_RATE}Hz, ${AudioConfig.CHANNELS}ch`)
      this.decoder = new OpusScript(
        AudioConfig.OUTPUT_SAMPLE_RATE as any,
        AudioConfig.CHANNELS as any,
        OpusScript.Application.VOIP,
      )
      logger.info('解码器创建成功')

      logger.info('OpusCodec 初始化完成 ✓')
      logger.info(`编码器: ${AudioConfig.INPUT_SAMPLE_RATE}Hz, ${AudioConfig.CHANNELS}ch`)
      logger.info(`解码器: ${AudioConfig.OUTPUT_SAMPLE_RATE}Hz, ${AudioConfig.CHANNELS}ch`)
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
      if (pcmBuffer.length !== AudioConfig.INPUT_FRAME_SIZE) {
        logger.warn(`PCM 帧大小不正确: ${pcmBuffer.length}, 期望: ${AudioConfig.INPUT_FRAME_SIZE}`)
      }

      // opusscript 需要 Buffer 类型
      const inputBuffer = Buffer.from(pcmBuffer.buffer, pcmBuffer.byteOffset, pcmBuffer.byteLength)

      // Opus 编码
      const opusFrame = this.encoder.encode(inputBuffer, AudioConfig.INPUT_FRAME_SIZE)

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
   * @returns Int16 PCM Buffer (480 samples)
   */
  decode(opusFrame: Buffer): Buffer {
    try {
      // Opus 解码
      const pcmBuffer = this.decoder.decode(opusFrame)

      // 验证输出大小
      const expectedSize = AudioConfig.OUTPUT_FRAME_SIZE * 2 // Int16 = 2 bytes per sample
      if (pcmBuffer.length !== expectedSize) {
        logger.warn(`解码后 PCM 大小不正确: ${pcmBuffer.length}, 期望: ${expectedSize}`)
      }

      return Buffer.from(pcmBuffer)
    }
    catch (error) {
      logger.error('Opus 解码失败:', error)
      throw error
    }
  }
}
