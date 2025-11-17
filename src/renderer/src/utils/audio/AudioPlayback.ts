/**
 * 音频播放类
 * 负责接收解码后的 PCM 数据并无缝播放
 */
import type { Buffer } from 'node:buffer'

export class AudioPlayback {
  private audioContext: AudioContext | null = null
  private nextStartTime = 0 // 下一帧开始时间(用于无缝播放)
  // 配置常量
  private readonly SAMPLE_RATE = 24000 // 24kHz
  private readonly CHANNELS = 1 // 单声道
  private readonly FRAME_SIZE = 480 // 24kHz * 0.02s = 480 samples

  /**
   * 初始化音频播放
   */
  async initialize(): Promise<void> {
    try {
      console.log('初始化 AudioPlayback...')

      // 创建 24kHz 音频上下文
      this.audioContext = new AudioContext({
        sampleRate: this.SAMPLE_RATE,
      })

      console.log(`AudioContext 创建成功: ${this.audioContext.sampleRate}Hz`)

      // 监听主进程发送的解码后音频
      window.api.audioOnOpusDecoded((pcmBuffer: Buffer) => {
        this.playPCM(pcmBuffer)
      })

      console.log('AudioPlayback 初始化完成')
    }
    catch (error) {
      console.error('AudioPlayback 初始化失败:', error)
      throw error
    }
  }

  /**
   * 播放 PCM 数据
   * @param pcmBuffer Buffer 包含 Int16 PCM 数据
   */
  private playPCM(pcmBuffer: Buffer): void {
    if (!this.audioContext) {
      console.error('AudioContext 未初始化')
      return
    }

    try {
      // Buffer → Int16Array
      const int16Array = new Int16Array(
        pcmBuffer.buffer,
        pcmBuffer.byteOffset,
        pcmBuffer.byteLength / 2,
      )

      // 验证数据长度
      if (int16Array.length !== this.FRAME_SIZE) {
        console.warn(
          `PCM 数据长度不正确: ${int16Array.length}, 期望: ${this.FRAME_SIZE}`,
        )
      }

      // Int16 → Float32 转换
      const float32Array = this.convertInt16ToFloat32(int16Array)

      // 创建 AudioBuffer
      const audioBuffer = this.audioContext.createBuffer(
        this.CHANNELS,
        float32Array.length,
        this.SAMPLE_RATE,
      )

      // 填充数据到第一个声道
      audioBuffer.getChannelData(0).set(float32Array)

      // 创建播放源
      const source = this.audioContext.createBufferSource()
      source.buffer = audioBuffer
      source.connect(this.audioContext.destination)

      // 无缝连续播放
      const now = this.audioContext.currentTime

      // 如果 nextStartTime 已经过去,重置为当前时间
      if (this.nextStartTime < now) {
        this.nextStartTime = now
      }

      // 在预定时间开始播放
      source.start(this.nextStartTime)

      // 累加帧时长 (20ms)
      this.nextStartTime += audioBuffer.duration

      // console.log(`播放 PCM: ${int16Array.length} samples, 下次开始: ${this.nextStartTime.toFixed(3)}s`)
    }
    catch (error) {
      console.error('播放 PCM 失败:', error)
    }
  }

  /**
   * Int16 转 Float32
   * @param int16 Int16Array 输入 (范围 [-32768, 32767])
   * @returns Float32Array 输出 (范围 [-1.0, 1.0])
   */
  private convertInt16ToFloat32(int16: Int16Array): Float32Array {
    const float32 = new Float32Array(int16.length)

    for (let i = 0; i < int16.length; i++) {
      // 转换为 Float32
      // 负数: int16 / 32768
      // 正数: int16 / 32767
      float32[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7FFF)
    }

    return float32
  }

  /**
   * 停止播放
   */
  stop(): void {
    console.log('停止音频播放...')

    // 重置播放时间
    this.nextStartTime = 0

    // 移除监听器
    window.api.audioRemoveOpusDecodedListener()

    console.log('音频播放已停止')
  }

  /**
   * 清理资源
   */
  async dispose(): Promise<void> {
    console.log('清理 AudioPlayback 资源...')

    this.stop()

    if (this.audioContext && this.audioContext.state !== 'closed') {
      await this.audioContext.close()
      this.audioContext = null
    }

    console.log('AudioPlayback 资源已清理')
  }

  /**
   * 获取当前播放延迟(秒)
   */
  getLatency(): number {
    if (!this.audioContext) {
      return 0
    }

    const now = this.audioContext.currentTime
    return Math.max(0, this.nextStartTime - now)
  }
}
