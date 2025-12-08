/**
 * PCM 音频采集处理器
 * 运行在 AudioWorklet 独立线程中
 * 负责累积音频样本到指定帧大小并发送到主线程
 * 支持实时重采样（使用多相滤波器）
 */
class PCMCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()

    // 从options获取配置参数
    const processorOptions = options.processorOptions || {}
    this.inputSampleRate = processorOptions.inputSampleRate || 16000
    this.outputSampleRate = processorOptions.outputSampleRate || 16000
    this.BUFFER_SIZE = processorOptions.bufferSize || 320
    this.buffer = []

    // 计算重采样比例
    this.resampleRatio = this.inputSampleRate / this.outputSampleRate
    this.needsResampling = Math.abs(this.resampleRatio - 1.0) > 0.01

    console.log('PCMCaptureProcessor 已创建:', {
      输入采样率: this.inputSampleRate,
      输出采样率: this.outputSampleRate,
      帧大小: this.BUFFER_SIZE,
      重采样比例: this.resampleRatio.toFixed(3),
      需要重采样: this.needsResampling,
    })

    // 监听来自主线程的配置更新消息
    this.port.onmessage = (event) => {
      if (event.data.type === 'updateConfig') {
        this.inputSampleRate = event.data.inputSampleRate || this.inputSampleRate
        this.outputSampleRate = event.data.outputSampleRate || this.outputSampleRate
        this.BUFFER_SIZE = event.data.bufferSize || this.BUFFER_SIZE
        this.resampleRatio = this.inputSampleRate / this.outputSampleRate
        this.needsResampling = Math.abs(this.resampleRatio - 1.0) > 0.01

        console.log('PCMCaptureProcessor 配置已更新:', {
          输入采样率: this.inputSampleRate,
          输出采样率: this.outputSampleRate,
          新帧大小: this.BUFFER_SIZE,
          重采样比例: this.resampleRatio.toFixed(3),
          需要重采样: this.needsResampling,
        })

        // 清空缓冲区以避免混合不同帧大小的数据
        this.buffer = []
      }
    }
  }

  /**
   * 音频处理回调
   * @param {Float32Array[][]} inputs - 输入音频数据
   * @param {Float32Array[][]} _outputs - 输出音频数据
   * @param {object} _parameters - 参数
   * @returns {boolean} - 返回 true 继续处理
   */
  process(inputs, _outputs, _parameters) {
    const input = inputs[0]

    // 检查是否有输入
    if (!input || input.length === 0) {
      return true
    }

    // 获取第一个声道的数据 (单声道)
    const samples = input[0] // Float32Array, 通常 128 samples

    if (!samples || samples.length === 0) {
      return true
    }

    // 累积样本到缓冲区
    for (let i = 0; i < samples.length; i++) {
      this.buffer.push(samples[i])
    }

    // 当累积到目标大小时,发送完整帧
    if (this.buffer.length >= this.BUFFER_SIZE) {
      // 提取完整帧
      let frame = new Float32Array(this.buffer.slice(0, this.BUFFER_SIZE))

      // 移除已提取的样本
      this.buffer = this.buffer.slice(this.BUFFER_SIZE)

      // 重采样（如果需要）
      if (this.needsResampling) {
        frame = this.resample(frame)
      }

      // 发送到主线程 (使用 Transferable 零拷贝)
      this.port.postMessage(frame, [frame.buffer])
    }

    // 返回 true 表示继续处理
    return true
  }

  /**
   * 多相滤波器重采样
   * 使用简单的低通滤波器进行抗混叠处理
   * @param {Float32Array} input - 输入音频数据
   * @returns {Float32Array} - 重采样后的音频数据
   */
  resample(input) {
    const ratio = this.resampleRatio
    const outputLength = Math.floor(input.length / ratio)
    const output = new Float32Array(outputLength)

    // 3 点低通滤波器系数（用于抗混叠）
    // 归一化的汉明窗口系数
    const filterCoeffs = [0.25, 0.5, 0.25]
    const filterRadius = Math.floor(filterCoeffs.length / 2)

    for (let i = 0; i < outputLength; i++) {
      // 计算输入位置
      const centerPos = i * ratio
      const centerIndex = Math.floor(centerPos)

      let sum = 0
      let weightSum = 0

      // 应用低通滤波器（抗混叠）
      for (let j = 0; j < filterCoeffs.length; j++) {
        const inputIndex = centerIndex + j - filterRadius

        // 边界检查
        if (inputIndex >= 0 && inputIndex < input.length) {
          sum += input[inputIndex] * filterCoeffs[j]
          weightSum += filterCoeffs[j]
        }
      }

      // 归一化输出
      output[i] = weightSum > 0 ? sum / weightSum : 0
    }

    return output
  }
}

// 注册处理器
registerProcessor('pcm-capture-processor', PCMCaptureProcessor)
