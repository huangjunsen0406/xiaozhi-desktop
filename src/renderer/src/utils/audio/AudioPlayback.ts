/**
 * 音频播放类
 * 负责接收解码后的 PCM 数据并无缝播放
 */
import type { Buffer } from 'node:buffer'

export class AudioPlayback {
  private audioContext: AudioContext | null = null
  private nextStartTime = 0 // 下一帧开始时间(用于无缝播放)
  private deviceId: string | undefined = undefined
  private removeOpusDecodedListener: (() => void) | null = null

  // 配置（从数据库动态加载）
  private sampleRate = 24000
  private channels = 1
  private frameDuration = 20
  private frameSize = 480

  /**
   * 初始化音频播放
   * @param deviceId 可选的设备ID，用于指定输出设备
   */
  async initialize(deviceId?: string): Promise<void> {
    try {
      console.log('初始化 AudioPlayback...', deviceId ? `设备ID: ${deviceId}` : '使用默认设备')

      this.deviceId = deviceId

      // 加载音频配置
      const audioConfig = await window.api.audioGetConfig()
      this.sampleRate = audioConfig.outputSampleRate || 24000
      this.channels = audioConfig.channels || 1
      this.frameDuration = audioConfig.frameDuration || 20

      // 计算帧大小 (samples)
      this.frameSize = Math.floor(this.sampleRate * (this.frameDuration / 1000))

      console.log('音频播放配置:', {
        sampleRate: this.sampleRate,
        channels: this.channels,
        frameDuration: this.frameDuration,
        frameSize: this.frameSize,
      })

      // 创建音频上下文
      this.audioContext = new AudioContext({
        sampleRate: this.sampleRate,
      })
      this.installStateWatch(this.audioContext)

      console.log(`AudioContext 创建成功: ${this.audioContext.sampleRate}Hz`)

      // 如果指定了输出设备且不是 'default'，设置输出目标
      if (this.deviceId && this.deviceId !== 'default' && 'setSinkId' in this.audioContext) {
        try {
          // @ts-expect-error setSinkId 是实验性 API，TypeScript 可能没有类型定义
          await this.audioContext.setSinkId(this.deviceId)
          console.log('输出设备已设置:', this.deviceId)
        }
        catch (error) {
          console.warn('设置输出设备失败，使用默认设备:', error)
        }
      }

      // 监听主进程发送的解码后音频
      if (this.removeOpusDecodedListener) {
        this.removeOpusDecodedListener()
        this.removeOpusDecodedListener = null
      }

      this.removeOpusDecodedListener = window.api.audioOnOpusDecoded((pcmBuffer: Buffer) => {
        this.playPCM(pcmBuffer)
      })

      console.log('AudioPlayback 初始化完成')
    }
    catch (error) {
      console.error('AudioPlayback 初始化失败:', error)
      throw error
    }
  }

  private installStateWatch(ctx: AudioContext): void {
    ctx.onstatechange = () => {
      if (ctx.state === 'suspended') {
        console.warn('[AEC] AudioContext(playback) suspended，尝试恢复...')
        ctx.resume().catch(e => console.error('[AEC] resume 失败:', e))
      }
    }
  }

  /**
   * 切换输出设备
   * @param deviceId 新的设备ID
   */
  async switchDevice(deviceId: string): Promise<void> {
    if (!this.audioContext) {
      throw new Error('AudioContext 未初始化')
    }

    console.log('切换输出设备:', deviceId)

    this.deviceId = deviceId

    // 使用 setSinkId 切换输出设备
    if ('setSinkId' in this.audioContext) {
      try {
        // @ts-expect-error setSinkId 是实验性 API
        await this.audioContext.setSinkId(deviceId)
        console.log('输出设备已切换:', deviceId)
      }
      catch (error) {
        console.error('切换输出设备失败:', error)
        throw error
      }
    }
    else {
      console.warn('当前浏览器不支持 setSinkId API')
    }
  }

  /**
   * 更新配置（动态更新采样率和帧长度）
   * 用于配置变更时无需重启应用
   */
  async updateConfig(): Promise<void> {
    console.log('更新音频播放配置...')

    try {
      // 重新加载配置
      const audioConfig = await window.api.audioGetConfig()
      const newSampleRate = audioConfig.outputSampleRate || 24000
      const newFrameDuration = audioConfig.frameDuration || 20

      // 检查是否有变化
      if (newSampleRate === this.sampleRate && newFrameDuration === this.frameDuration) {
        console.log('配置未变化，跳过更新')
        return
      }

      console.log('检测到配置变化:', {
        旧采样率: this.sampleRate,
        新采样率: newSampleRate,
        旧帧长度: this.frameDuration,
        新帧长度: newFrameDuration,
      })

      // 更新本地配置
      this.sampleRate = newSampleRate
      this.frameDuration = newFrameDuration
      this.frameSize = Math.floor(this.sampleRate * (this.frameDuration / 1000))

      console.log('✓ 音频播放配置已更新:', {
        sampleRate: this.sampleRate,
        frameDuration: this.frameDuration,
        frameSize: this.frameSize,
      })

      // 注意：AudioContext 不需要重建
      // 因为 createBuffer 时会指定采样率，浏览器会自动重采样到设备采样率
    }
    catch (error) {
      console.error('更新音频播放配置失败:', error)
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

      // 注意：不验证数据长度，因为服务端可能使用不同的帧大小
      // 客户端配置的帧长度主要用于本地采集，解码时应该灵活处理
      // if (int16Array.length !== this.frameSize) {
      //   console.warn(
      //     `PCM 数据长度不正确: ${int16Array.length}, 期望: ${this.frameSize}`,
      //   )
      // }

      // Int16 → Float32 转换
      const float32Array = this.convertInt16ToFloat32(int16Array)

      // 创建 AudioBuffer
      const audioBuffer = this.audioContext.createBuffer(
        this.channels,
        float32Array.length,
        this.sampleRate,
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

    // 关闭当前 AudioContext 以立即取消所有已调度的音频
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {})
      // 创建新的 AudioContext 以备后续播放
      this.audioContext = new AudioContext({ sampleRate: this.sampleRate })
      this.installStateWatch(this.audioContext)
      // 恢复输出设备设置
      if (this.deviceId && this.deviceId !== 'default' && 'setSinkId' in this.audioContext) {
        // @ts-expect-error setSinkId 是实验性 API
        this.audioContext.setSinkId(this.deviceId).catch(() => {})
      }
    }

    // 重置播放时间
    this.nextStartTime = 0

    // 移除监听器
    if (this.removeOpusDecodedListener) {
      this.removeOpusDecodedListener()
      this.removeOpusDecodedListener = null
    }

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
