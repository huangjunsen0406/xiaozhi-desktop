import type { AudioListener } from '../types/audio'
import path from 'node:path'

/**
 * 唤醒词配置接口
 */
export interface WakeWordConfig {
  language: string // 语言代码，如 'zh', 'en'
  modelsBasePath: string // 模型基础路径
  keyword?: string // 自定义唤醒词（可选，用于显示）
  numThreads?: number
  maxActivePaths?: number
  keywordsScore?: number
  keywordsThreshold?: number
  numTrailingBlanks?: number
}

/**
 * 唤醒词检测器
 * 使用 Sherpa-ONNX KeywordSpotter 检测唤醒词
 */
export class WakeWordDetector implements AudioListener {
  readonly name = 'WakeWordDetector'

  private keywordSpotter: any = null
  private stream: any = null
  private enabled: boolean = false
  private shuttingDown: boolean = false

  // 音频队列（异步处理）
  private audioQueue: Int16Array[] = []
  private processing: boolean = false
  private processingHandle: NodeJS.Immediate | null = null
  private maxQueueSize: number = 100

  // 防抖机制
  private lastDetectionTime: number = 0
  private cooldownMs: number = 1500 // 1.5秒冷却时间

  // 回调函数
  private onDetectedCallback?: (keyword: string) => void
  private onErrorCallback?: (error: Error) => void

  constructor(config: WakeWordConfig) {
    this.initKeywordSpotter(config)
  }

  /**
   * 初始化 Sherpa-ONNX KeywordSpotter
   */
  private initKeywordSpotter(config: WakeWordConfig): void {
    try {
      // 加载 sherpa-onnx-node
      // 注意：需要先运行 scripts/fix-sherpa-onnx-rpath.sh 修复动态库路径
      // eslint-disable-next-line ts/no-require-imports
      const sherpa_onnx = require('sherpa-onnx-node')

      // 构建模型文件路径
      const modelPath = path.join(config.modelsBasePath, config.language)
      const tokensPath = path.join(modelPath, 'tokens.txt')
      const encoderPath = path.join(modelPath, 'encoder.onnx')
      const decoderPath = path.join(modelPath, 'decoder.onnx')
      const joinerPath = path.join(modelPath, 'joiner.onnx')
      const keywordsPath = path.join(modelPath, 'keywords.txt')

      console.log('[WakeWordDetector] 开始初始化 KeywordSpotter')
      console.log('[WakeWordDetector] 配置:', {
        language: config.language,
        modelPath,
        numThreads: config.numThreads || 4,
        keywordsScore: config.keywordsScore || 1.8,
        keywordsThreshold: config.keywordsThreshold || 0.2,
      })

      // 按照 sherpa-onnx-node 的 API 格式配置
      this.keywordSpotter = new sherpa_onnx.KeywordSpotter({
        featConfig: {
          sampleRate: 16000,
          featureDim: 80,
        },
        modelConfig: {
          transducer: {
            encoder: encoderPath,
            decoder: decoderPath,
            joiner: joinerPath,
          },
          tokens: tokensPath,
          numThreads: config.numThreads || 4,
          provider: 'cpu',
          debug: 0,
        },
        maxActivePaths: config.maxActivePaths || 2,
        keywordsScore: config.keywordsScore || 1.8,
        keywordsThreshold: config.keywordsThreshold || 0.2,
        numTrailingBlanks: config.numTrailingBlanks || 1,
        keywordsFile: keywordsPath,
      })

      this.stream = this.keywordSpotter.createStream()
      this.enabled = true
      this.shuttingDown = false
      console.log('[WakeWordDetector] KeywordSpotter 初始化成功')
    }
    catch (error) {
      console.error('[WakeWordDetector] 初始化失败:', error)
      this.enabled = false

      if (this.onErrorCallback) {
        this.onErrorCallback(error as Error)
      }
    }
  }

  /**
   * 重新加载模型（用于切换语言或更新配置）
   */
  reload(config: WakeWordConfig): void {
    console.log('[WakeWordDetector] 重新加载模型...')

    // 标记为关闭状态，停止接收新音频
    this.shuttingDown = true
    this.enabled = false

    // 取消 pending 的处理
    if (this.processingHandle) {
      clearImmediate(this.processingHandle)
      this.processingHandle = null
    }

    // 等待当前处理完成
    const waitForProcessing = () => {
      return new Promise<void>((resolve) => {
        if (!this.processing) {
          resolve()
        }
        else {
          setTimeout(() => {
            waitForProcessing().then(resolve)
          }, 50)
        }
      })
    }

    waitForProcessing().then(() => {
      // 清理旧资源
      this.audioQueue = []
      this.stream = null
      this.keywordSpotter = null

      // 重新初始化
      this.initKeywordSpotter(config)
    })
  }

  /**
   * AudioListener 接口实现：接收音频数据
   */
  onAudioData(pcmData: Int16Array): void {
    if (!this.enabled || !this.stream || this.shuttingDown) {
      return
    }

    // 推入队列
    this.audioQueue.push(pcmData.slice()) // 复制数据

    // 限制队列长度，避免内存溢出
    if (this.audioQueue.length > this.maxQueueSize) {
      this.audioQueue.shift() // 丢弃最旧的数据
    }

    // 异步处理（避免阻塞主线程）
    if (!this.processing && !this.processingHandle) {
      this.processing = true
      this.processingHandle = setImmediate(() => {
        this.processingHandle = null
        this.processAudioQueue()
      })
    }
  }

  /**
   * 处理音频队列
   */
  private processAudioQueue(): void {
    // 检查是否正在关闭
    if (this.shuttingDown || !this.enabled) {
      this.processing = false
      return
    }

    try {
      while (this.audioQueue.length > 0 && !this.shuttingDown) {
        const pcmData = this.audioQueue.shift()!

        // 转换 Int16Array → Float32Array
        const samples = new Float32Array(pcmData.length)
        for (let i = 0; i < pcmData.length; i++) {
          samples[i] = pcmData[i] / 32768.0
        }

        // 喂给 KeywordSpotter
        this.stream.acceptWaveform({
          sampleRate: 16000,
          samples,
        })

        // 检测
        if (this.keywordSpotter.isReady(this.stream)) {
          this.keywordSpotter.decode(this.stream)
          const result = this.keywordSpotter.getResult(this.stream)

          // result.keyword 是检测到的关键词字符串
          if (result && result.keyword && result.keyword !== '') {
            this.handleDetection(result.keyword)
            // 重置流
            this.keywordSpotter.reset(this.stream)
          }
        }
      }
    }
    catch (error) {
      console.error('[WakeWordDetector] 处理音频队列失败:', error)

      if (this.onErrorCallback) {
        this.onErrorCallback(error as Error)
      }
    }
    finally {
      this.processing = false
    }
  }

  /**
   * 处理检测结果
   */
  private handleDetection(keyword: string): void {
    console.log(keyword)

    // 防抖：避免短时间内重复触发】
    const now = Date.now()
    if (now - this.lastDetectionTime < this.cooldownMs) {
      console.log(`[WakeWordDetector] 冷却中，忽略检测: ${keyword}`)
      return
    }

    this.lastDetectionTime = now
    console.log(`[WakeWordDetector] ✅ 检测到唤醒词: ${keyword}`)

    // 触发回调
    if (this.onDetectedCallback) {
      this.onDetectedCallback(keyword)
    }
  }

  /**
   * 设置检测回调
   */
  onDetected(callback: (keyword: string) => void): void {
    this.onDetectedCallback = callback
  }

  /**
   * 设置错误回调
   */
  onError(callback: (error: Error) => void): void {
    this.onErrorCallback = callback
  }

  /**
   * 获取是否启用
   */
  isEnabled(): boolean {
    return this.enabled
  }

  /**
   * 更新冷却时间
   */
  setCooldown(cooldownMs: number): void {
    this.cooldownMs = cooldownMs
    console.log(`[WakeWordDetector] 冷却时间已更新: ${cooldownMs}ms`)
  }

  /**
   * 关闭检测器
   */
  shutdown(): void {
    console.log('[WakeWordDetector] 正在关闭...')
    this.shuttingDown = true
    this.enabled = false

    // 取消 pending 的处理
    if (this.processingHandle) {
      clearImmediate(this.processingHandle)
      this.processingHandle = null
    }

    // 等待当前处理完成
    const waitForProcessing = () => {
      if (!this.processing) {
        // 清理资源
        this.audioQueue = []
        this.stream = null
        this.keywordSpotter = null
        console.log('[WakeWordDetector] 已关闭')
      }
      else {
        setTimeout(() => waitForProcessing(), 50)
      }
    }

    waitForProcessing()
  }
}
