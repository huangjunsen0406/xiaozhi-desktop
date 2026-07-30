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

  // 配置（从数据库动态加载）
  private sampleRate = 16000
  private channels = 1
  private frameDuration = 20

  /**
   * 初始化音频采集
   * @param deviceId 可选的设备ID，用于指定麦克风设备
   */
  async initialize(deviceId?: string): Promise<void> {
    try {
      console.log('初始化 AudioCapture...', deviceId ? `设备ID: ${deviceId}` : '使用默认设备')

      this.deviceId = deviceId

      // 加载音频配置
      const audioConfig = await window.api.audioGetConfig()
      this.sampleRate = audioConfig.inputSampleRate || 16000
      this.channels = audioConfig.channels || 1
      this.frameDuration = audioConfig.frameDuration || 20

      console.log('音频配置:', {
        目标采样率: this.sampleRate,
        声道数: this.channels,
        帧长度: this.frameDuration,
      })

      // 创建音频上下文（请求目标采样率）
      this.audioContext = new AudioContext({
        sampleRate: this.sampleRate,
      })

      this.audioContext.onstatechange = () => {
        if (this.audioContext?.state === 'suspended') {
          console.warn('[AEC] AudioContext(capture) suspended，尝试恢复...')
          this.audioContext.resume().catch(e => console.error('[AEC] resume 失败:', e))
        }
      }

      // 获取实际采样率（浏览器可能不支持请求的采样率）
      const actualSampleRate = this.audioContext.sampleRate

      console.log(`AudioContext 创建成功: 请求 ${this.sampleRate}Hz, 实际 ${actualSampleRate}Hz`)

      // 使用实际采样率计算 bufferSize
      const bufferSize = Math.floor(actualSampleRate * (this.frameDuration / 1000))

      console.log('采集参数:', {
        实际采样率: actualSampleRate,
        目标采样率: this.sampleRate,
        bufferSize,
        需要重采样: actualSampleRate !== this.sampleRate,
      })

      // 加载 AudioWorklet 模块
      await this.audioContext.audioWorklet.addModule('./worklets/pcm-capture-processor.js')

      console.log('AudioWorklet 模块加载成功')

      // 创建 Worklet 节点，传递配置参数（包括重采样参数）
      this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-capture-processor', {
        processorOptions: {
          inputSampleRate: actualSampleRate, // 实际采样率
          outputSampleRate: this.sampleRate, // 目标采样率
          bufferSize, // 使用实际采样率计算的 bufferSize
        },
      })

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
      const aecMode = audioConfig.aecMode
        ?? (audioConfig.enableEchoCancellation === false ? 'off' : 'app')

      // 构建音频约束（Chromium AEC：off 关 EC；app/system 开 EC）
      // system 先尝试 ideal:'all'（新规范），失败再 boolean true
      const baseConstraints: MediaTrackConstraints = {
        noiseSuppression: audioConfig.enableNoiseReduction !== false,
        autoGainControl: true,
        sampleRate: this.sampleRate,
        channelCount: this.channels,
      }
      if (this.deviceId && this.deviceId !== 'default') {
        baseConstraints.deviceId = { exact: this.deviceId }
      }

      const tryGum = async (echoCancellation: boolean | object) => {
        const audioConstraints: MediaTrackConstraints = {
          ...baseConstraints,
          echoCancellation: echoCancellation as boolean,
        }
        return navigator.mediaDevices.getUserMedia({ audio: audioConstraints })
      }

      if (aecMode === 'off') {
        this.stream = await tryGum(false)
      }
      else if (aecMode === 'system') {
        try {
          this.stream = await tryGum({ ideal: 'all' })
        }
        catch (gumError) {
          console.warn('[AEC] system ideal:all 失败，回退 echoCancellation:true', gumError)
          this.stream = await tryGum(true)
        }
      }
      else {
        this.stream = await tryGum(true)
      }

      // track 意外结束时自动重连（蓝牙切换、设备断连等）
      const track = this.stream.getAudioTracks()[0]
      if (track) {
        track.onended = () => {
          console.warn('[AEC] 麦克风 track 意外结束，尝试重新采集...')
          this.start(this.deviceId).catch(e => console.error('[AEC] 重新采集失败:', e))
        }

        const settings = track.getSettings()
        const echoApplied = settings.echoCancellation === true
        console.log('[AEC] capture settings', {
          aecMode,
          echoCancellation: settings.echoCancellation,
          noiseSuppression: settings.noiseSuppression,
        })
        try {
          await window.api.audioReportAecCapture({
            echoCancellationApplied: echoApplied,
          })
        }
        catch (reportErr) {
          console.warn('[AEC] 上报采集状态失败', reportErr)
        }
      }

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
   * 更新配置（动态更新采样率和帧长度）
   * 用于配置变更时无需重启应用
   */
  async updateConfig(): Promise<void> {
    console.log('更新音频采集配置...')

    try {
      // 重新加载配置
      const audioConfig = await window.api.audioGetConfig()
      const newSampleRate = audioConfig.inputSampleRate || 16000
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

      if (!this.audioContext || !this.workletNode) {
        console.warn('AudioContext 未初始化，跳过更新')
        return
      }

      // 计算新的 bufferSize
      const actualSampleRate = this.audioContext.sampleRate
      const bufferSize = Math.floor(actualSampleRate * (this.frameDuration / 1000))

      console.log('发送配置更新到 AudioWorklet:', {
        实际采样率: actualSampleRate,
        目标采样率: this.sampleRate,
        bufferSize,
      })

      // 发送更新消息给 AudioWorklet（利用现有的动态配置机制）
      this.workletNode.port.postMessage({
        type: 'updateConfig',
        inputSampleRate: actualSampleRate,
        outputSampleRate: this.sampleRate,
        bufferSize,
      })

      console.log('✓ 音频采集配置已更新')
    }
    catch (error) {
      console.error('更新音频采集配置失败:', error)
      throw error
    }
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
