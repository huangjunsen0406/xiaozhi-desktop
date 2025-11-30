/**
 * PCM 音频采集处理器
 * 运行在 AudioWorklet 独立线程中
 * 负责累积音频样本到指定帧大小并发送到主线程
 */
class PCMCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()

    // 从options获取配置参数，默认 20ms @ 16kHz = 320 samples
    const processorOptions = options.processorOptions || {}
    this.BUFFER_SIZE = processorOptions.bufferSize || 320
    this.buffer = []

    console.log('PCMCaptureProcessor 已创建, 帧大小:', this.BUFFER_SIZE)

    // 监听来自主线程的配置更新消息
    this.port.onmessage = (event) => {
      if (event.data.type === 'updateConfig') {
        this.BUFFER_SIZE = event.data.bufferSize
        console.log('PCMCaptureProcessor 配置已更新, 新帧大小:', this.BUFFER_SIZE)
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
      const frame = new Float32Array(this.buffer.slice(0, this.BUFFER_SIZE))

      // 移除已提取的样本
      this.buffer = this.buffer.slice(this.BUFFER_SIZE)

      // 发送到主线程 (使用 Transferable 零拷贝)
      this.port.postMessage(frame, [frame.buffer])
    }

    // 返回 true 表示继续处理
    return true
  }
}

// 注册处理器
registerProcessor('pcm-capture-processor', PCMCaptureProcessor)
