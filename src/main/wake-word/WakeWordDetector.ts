import type { AudioListener } from '@shared/types'
import type { KeywordSpotter, KeywordSpotterStream } from '../types/database'
import path from 'node:path'
import sherpa_onnx from 'sherpa-onnx-node'
import { getLogger } from '../utils/logger'

const logger = getLogger('WakeWord')

export interface WakeWordDetectorConfig {
  language: string
  modelsBasePath: string
  keyword?: string
  numThreads?: number
  maxActivePaths?: number
  keywordsScore?: number
  keywordsThreshold?: number
  numTrailingBlanks?: number
}

export class WakeWordDetector implements AudioListener {
  readonly name = 'WakeWordDetector'

  private keywordSpotter: KeywordSpotter | null = null
  private stream: KeywordSpotterStream | null = null
  private enabled: boolean = false
  private shuttingDown: boolean = false

  private audioQueue: Int16Array[] = []
  private processing: boolean = false
  private processingHandle: NodeJS.Immediate | null = null
  private maxQueueSize: number = 100

  private lastDetectionTime: number = 0
  private cooldownMs: number = 1500

  private onDetectedCallback?: (keyword: string) => void
  private onErrorCallback?: (error: Error) => void

  constructor(config: WakeWordDetectorConfig) {
    this.initKeywordSpotter(config)
  }

  private initKeywordSpotter(config: WakeWordDetectorConfig): void {
    try {
      const modelPath = path.join(config.modelsBasePath, config.language)
      const tokensPath = path.join(modelPath, 'tokens.txt')
      const encoderPath = path.join(modelPath, 'encoder.onnx')
      const decoderPath = path.join(modelPath, 'decoder.onnx')
      const joinerPath = path.join(modelPath, 'joiner.onnx')
      const keywordsPath = path.join(modelPath, 'keywords.txt')

      logger.info('开始初始化 KeywordSpotter')
      logger.info('配置:', {
        language: config.language,
        modelPath,
        numThreads: config.numThreads || 4,
        keywordsScore: config.keywordsScore || 1.8,
        keywordsThreshold: config.keywordsThreshold || 0.2,
      })

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

      this.stream = this.keywordSpotter!.createStream()
      this.enabled = true
      this.shuttingDown = false
      logger.info('KeywordSpotter 初始化成功')
    }
    catch (error) {
      logger.error('初始化失败:', error)
      this.enabled = false

      if (this.onErrorCallback) {
        this.onErrorCallback(error as Error)
      }
    }
  }

  reload(config: WakeWordDetectorConfig): void {
    logger.info('重新加载模型...')

    this.shuttingDown = true
    this.enabled = false

    if (this.processingHandle) {
      clearImmediate(this.processingHandle)
      this.processingHandle = null
    }

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
      this.audioQueue = []
      this.stream = null
      this.keywordSpotter = null
      this.initKeywordSpotter(config)
    })
  }

  onAudioData(pcmData: Int16Array): void {
    if (!this.enabled || !this.stream || this.shuttingDown) {
      return
    }

    this.audioQueue.push(pcmData.slice())

    if (this.audioQueue.length > this.maxQueueSize) {
      this.audioQueue.shift()
    }

    if (!this.processing && !this.processingHandle) {
      this.processing = true
      this.processingHandle = setImmediate(() => {
        this.processingHandle = null
        this.processAudioQueue()
      })
    }
  }

  private processAudioQueue(): void {
    if (this.shuttingDown || !this.enabled) {
      this.processing = false
      return
    }

    try {
      while (this.audioQueue.length > 0 && !this.shuttingDown) {
        const pcmData = this.audioQueue.shift()!

        const samples = new Float32Array(pcmData.length)
        for (let i = 0; i < pcmData.length; i++) {
          samples[i] = pcmData[i] / 32768.0
        }

        this.stream!.acceptWaveform({
          sampleRate: 16000,
          samples,
        })

        if (this.keywordSpotter!.isReady(this.stream!)) {
          this.keywordSpotter!.decode(this.stream!)
          const result = this.keywordSpotter!.getResult(this.stream!)

          if (result && result.keyword && result.keyword !== '') {
            this.handleDetection(result.keyword)
            this.keywordSpotter!.reset(this.stream!)
          }
        }
      }
    }
    catch (error) {
      logger.error('处理音频队列失败:', error)

      if (this.onErrorCallback) {
        this.onErrorCallback(error as Error)
      }
    }
    finally {
      this.processing = false
    }
  }

  private handleDetection(keyword: string): void {
    logger.debug('检测到关键词', { keyword })

    const now = Date.now()
    if (now - this.lastDetectionTime < this.cooldownMs) {
      logger.debug('冷却中，忽略检测', { keyword })
      return
    }

    this.lastDetectionTime = now
    logger.info(`✅ 检测到唤醒词: ${keyword}`)

    if (this.onDetectedCallback) {
      this.onDetectedCallback(keyword)
    }
  }

  onDetected(callback: (keyword: string) => void): void {
    this.onDetectedCallback = callback
  }

  onError(callback: (error: Error) => void): void {
    this.onErrorCallback = callback
  }

  isEnabled(): boolean {
    return this.enabled
  }

  setCooldown(cooldownMs: number): void {
    this.cooldownMs = cooldownMs
    logger.info(`冷却时间已更新: ${cooldownMs}ms`)
  }

  shutdown(): void {
    logger.info('正在关闭...')
    this.shuttingDown = true
    this.enabled = false

    if (this.processingHandle) {
      clearImmediate(this.processingHandle)
      this.processingHandle = null
    }

    const waitForProcessing = () => {
      if (!this.processing) {
        this.audioQueue = []
        this.stream = null
        this.keywordSpotter = null
        logger.info('已关闭')
      }
      else {
        setTimeout(() => waitForProcessing(), 50)
      }
    }

    waitForProcessing()
  }
}
