import { Buffer } from 'node:buffer'
import OpusScript from 'opusscript'

/**
 * Opus 编解码器 (使用 opusscript - 纯 JS 实现)
 * 负责音频的编码和解码
 */
export class OpusCodec {
  private encoder: OpusScript
  private decoder: OpusScript

  // 配置常量
  private readonly INPUT_SAMPLE_RATE = 16000 // 输入采样率 16kHz
  private readonly OUTPUT_SAMPLE_RATE = 24000 // 输出采样率 24kHz
  private readonly CHANNELS = 1 // 单声道
  private readonly FRAME_SIZE_INPUT = 320 // 16kHz * 0.02s = 320 samples
  private readonly FRAME_SIZE_OUTPUT = 480 // 24kHz * 0.02s = 480 samples

  constructor() {
    try {
      console.log('开始初始化 OpusCodec (纯 JS 实现)...')

      // 创建 Opus 编码器 (16kHz, 单声道)
      console.log(`创建编码器: ${this.INPUT_SAMPLE_RATE}Hz, ${this.CHANNELS}ch`)
      this.encoder = new OpusScript(this.INPUT_SAMPLE_RATE, this.CHANNELS, OpusScript.Application.VOIP)
      console.log('编码器创建成功')

      // 创建 Opus 解码器 (24kHz, 单声道)
      console.log(`创建解码器: ${this.OUTPUT_SAMPLE_RATE}Hz, ${this.CHANNELS}ch`)
      this.decoder = new OpusScript(this.OUTPUT_SAMPLE_RATE, this.CHANNELS, OpusScript.Application.VOIP)
      console.log('解码器创建成功')

      console.log('OpusCodec 初始化完成 ✓')
      console.log(`编码器: ${this.INPUT_SAMPLE_RATE}Hz, ${this.CHANNELS}ch`)
      console.log(`解码器: ${this.OUTPUT_SAMPLE_RATE}Hz, ${this.CHANNELS}ch`)
    }
    catch (error) {
      console.error('OpusCodec 初始化失败:', error)
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
      if (pcmBuffer.length !== this.FRAME_SIZE_INPUT) {
        console.warn(`PCM 帧大小不正确: ${pcmBuffer.length}, 期望: ${this.FRAME_SIZE_INPUT}`)
      }

      // opusscript 需要 Buffer 类型
      const inputBuffer = Buffer.from(pcmBuffer.buffer, pcmBuffer.byteOffset, pcmBuffer.byteLength)

      // Opus 编码
      const opusFrame = this.encoder.encode(inputBuffer, this.FRAME_SIZE_INPUT)

      return Buffer.from(opusFrame)
    }
    catch (error) {
      console.error('Opus 编码失败:', error)
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
      const expectedSize = this.FRAME_SIZE_OUTPUT * 2 // Int16 = 2 bytes per sample
      if (pcmBuffer.length !== expectedSize) {
        console.warn(`解码后 PCM 大小不正确: ${pcmBuffer.length}, 期望: ${expectedSize}`)
      }

      return Buffer.from(pcmBuffer)
    }
    catch (error) {
      console.error('Opus 解码失败:', error)
      throw error
    }
  }
}
