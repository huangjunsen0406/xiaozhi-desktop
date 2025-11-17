/**
 * 音频采集类
 * 负责从麦克风采集音频,通过 AudioWorklet 处理,并发送到主进程
 */

export class AudioCapture {
  private audioContext: AudioContext | null = null
  private workletNode: AudioWorkletNode | null = null
  private stream: MediaStream | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private deviceId: string | undefined = undefined

  // 配置常量
  private readonly SAMPLE_RATE = 16000 // 16kHz
  private readonly CHANNELS = 1 // 单声道

  /**
   * 初始化音频采集
   * @param deviceId 可选的设备ID，用于指定麦克风设备
   */
  async initialize(deviceId?: string): Promise<void> {
    try {
      console.log('初始化 AudioCapture...', deviceId ? `设备ID: ${deviceId}` : '使用默认设备')

      this.deviceId = deviceId

      // 创建 16kHz 音频上下文
      this.audioContext = new AudioContext({
        sampleRate: this.SAMPLE_RATE,
      })

      console.log(`AudioContext 创建成功: ${this.audioContext.sampleRate}Hz`)

      // 加载 AudioWorklet 模块
      await this.audioContext.audioWorklet.addModule('/worklets/pcm-capture-processor.js')

      console.log('AudioWorklet 模块加载成功')

      // 创建 Worklet 节点
      this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-capture-processor')

      // 监听 Worklet 发送的 PCM 数据
      this.workletNode.port.onmessage = (event) => {
        const float32PCM = event.data as Float32Array
        this.handlePCMData(float32PCM)
      }

      console.log('AudioWorklet 节点创建成功')
    }
    catch (error) {
      console.error('AudioCapture 初始化失败:', error)
      throw error
    }
  }

  /**
   * 开始采集音频
   * @param deviceId 可选的设备ID，如果提供则覆盖初始化时的设备ID
   */
  async start(deviceId?: string): Promise<void> {
    if (!this.audioContext || !this.workletNode) {
      throw new Error('AudioCapture 未初始化')
    }

    // 如果提供了新的设备ID，更新当前设备ID
    if (deviceId !== undefined) {
      this.deviceId = deviceId
    }

    try {
      console.log('请求麦克风权限...', this.deviceId ? `设备ID: ${this.deviceId}` : '使用默认设备')

      // 获取音频配置
      const audioConfig = await window.api.audioGetConfig()

      // 构建音频约束
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: audioConfig.enableEchoCancellation,
        noiseSuppression: audioConfig.enableNoiseReduction,
        autoGainControl: true,
        sampleRate: this.SAMPLE_RATE,
        channelCount: this.CHANNELS,
      }

      // 如果指定了设备ID且不是 'default'，添加设备约束
      if (this.deviceId && this.deviceId !== 'default') {
        audioConstraints.deviceId = { exact: this.deviceId }
      }

      // 获取麦克风流
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
      })

      console.log('麦克风权限已获取')

      // 创建音频源节点
      this.source = this.audioContext.createMediaStreamSource(this.stream)

      // 连接音频图: 麦克风 → Worklet
      this.source.connect(this.workletNode)

      console.log('音频采集已启动')
    }
    catch (error) {
      console.error('启动音频采集失败:', error)
      throw error
    }
  }

  /**
   * 切换输入设备
   * @param deviceId 新的设备ID
   */
  async switchDevice(deviceId: string): Promise<void> {
    console.log('切换输入设备:', deviceId)

    // 停止当前采集
    this.stop()

    // 使用新设备重新启动
    await this.start(deviceId)
  }

  /**
   * 停止采集音频
   */
  stop(): void {
    console.log('停止音频采集...')

    try {
      // 断开连接
      if (this.source) {
        try {
          this.source.disconnect()
        }
        catch (e) {
          // 忽略断开连接错误
          console.log(e)
        }
        this.source = null
      }

      if (this.workletNode) {
        try {
          this.workletNode.disconnect()
        }
        catch (e) {
          console.log(e)
          // 忽略断开连接错误
        }
      }

      // 停止媒体流
      if (this.stream) {
        this.stream.getTracks().forEach((track) => {
          try {
            if (track.readyState !== 'ended') {
              track.stop()
            }
          }
          catch (e) {
            // 忽略停止错误
            console.log(e)
          }
        })
        this.stream = null
      }

      console.log('音频采集已停止')
    }
    catch (error) {
      console.warn('停止音频采集时发生错误（已忽略）:', error)
    }
  }

  /**
   * 清理资源
   */
  async dispose(): Promise<void> {
    console.log('清理 AudioCapture 资源...')

    this.stop()

    if (this.workletNode) {
      this.workletNode.port.onmessage = null
      this.workletNode = null
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      await this.audioContext.close()
      this.audioContext = null
    }

    console.log('AudioCapture 资源已清理')
  }

  /**
   * 处理 Worklet 发送的 PCM 数据
   * @param float32PCM Float32Array PCM 数据
   */
  private handlePCMData(float32PCM: Float32Array): void {
    try {
      // Float32 → Int16 转换
      const int16PCM = this.convertFloat32ToInt16(float32PCM)

      // 发送到主进程
      window.api.audioSendPCM(int16PCM)
    }
    catch (error) {
      console.error('处理 PCM 数据失败:', error)
    }
  }

  /**
   * Float32 转 Int16
   * @param float32 Float32Array 输入 (范围 [-1.0, 1.0])
   * @returns Int16Array 输出 (范围 [-32768, 32767])
   */
  private convertFloat32ToInt16(float32: Float32Array): Int16Array {
    const int16 = new Int16Array(float32.length)

    for (let i = 0; i < float32.length; i++) {
      // 先 clamp 到 [-1.0, 1.0] 范围
      const s = Math.max(-1, Math.min(1, float32[i]))

      // 转换为 Int16
      // 负数: s * 32768
      // 正数: s * 32767
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
    }

    return int16
  }
}
