import type { PluginCommands, PluginContext } from '../core'
import type { AudioPlugin } from './AudioPlugin'
import { AbortReason } from '../protocols/Protocol'
import { getDatabase } from '../services/database'
import { getLogger } from '../utils/logger'
import { getWakeWordKeywordsPath, getWakeWordModelsBundledDir } from '../utils/paths'
import { ensureSafeWakeWordKeywordsFile, ensureWakeWordKeywordsFile } from '../wake-word/keywordsFile'
import { WakeWordDetector } from '../wake-word/WakeWordDetector'
import { Plugin } from './Plugin'

const logger = getLogger('WakeWordPlugin')

export class WakeWordPlugin extends Plugin {
  readonly name = 'WakeWordPlugin'
  readonly priority = 35

  static readonly dependencies: string[] = ['AudioPlugin']

  readonly metadata = {
    name: 'WakeWordPlugin',
    version: '1.0.0',
    description: '唤醒词检测插件，基于 Sherpa-ONNX',
    author: 'Junsen',
  }

  private detector: WakeWordDetector | null = null

  private buildDetectorConfig(
    config: { language: string, keyword: string, score: number, threshold: number },
    keywordsFile: string,
  ) {
    const modelsPath = getWakeWordModelsBundledDir()
    logger.info('唤醒词路径', {
      modelsBasePath: modelsPath,
      keywordsFile,
      expectedUserPath: getWakeWordKeywordsPath(config.language),
    })

    return {
      language: config.language,
      modelsBasePath: modelsPath,
      keywordsFile,
      keyword: config.keyword,
      numThreads: 4,
      maxActivePaths: 2,
      keywordsScore: config.score,
      keywordsThreshold: config.threshold,
      numTrailingBlanks: 1,
    }
  }

  private attachDetectorCallbacks(): void {
    if (!this.detector)
      return
    this.detector.onDetected((keyword) => {
      void this.onWakeWordDetected(keyword)
    })
    this.detector.onError((error) => {
      logger.error('检测器错误', error)
    })
  }

  private detachAudioListener(): void {
    if (!this.detector)
      return
    try {
      this.getDep<AudioPlugin>('AudioPlugin').removeAudioListener(this.detector)
    }
    catch {
      // 依赖可能未就绪或已关闭
    }
  }

  async setup(ctx: PluginContext, cmd: PluginCommands): Promise<void> {
    await super.setup(ctx, cmd)
    logger.info('开始设置...')

    try {
      const db = getDatabase()
      const config = db.getFormattedWakeWordConfig()
      logger.info('唤醒词配置:', config)

      if (!config.enabled) {
        logger.info('唤醒词已关闭，跳过 KeywordSpotter 初始化')
        this.detector = null
        return
      }

      const safe = ensureSafeWakeWordKeywordsFile(config.language, config.keyword)
      if (safe.fellBack) {
        logger.warn('非法唤醒词已重置为默认', {
          language: config.language,
          from: config.keyword,
          to: safe.keyword,
          reason: safe.reason,
        })
        db.updateWakeWordConfig(
          config.language === 'en' ? { keyword_en: safe.keyword } : { keyword_zh: safe.keyword },
        )
      }

      this.detector = new WakeWordDetector(
        this.buildDetectorConfig({ ...config, keyword: safe.keyword }, safe.keywordsPath),
      )

      if (this.detector.isEnabled()) {
        this.detector.setCooldown(config.cooldownMs)
        logger.info('设置完成')
      }
      else {
        logger.warn('检测器未启用（可能模型文件缺失）')
      }

      this.attachDetectorCallbacks()
    }
    catch (error) {
      logger.error('设置失败', error)
      this.detector = null
    }
  }

  async reloadConfig(): Promise<void> {
    logger.info('重新加载配置...')

    const config = getDatabase().getFormattedWakeWordConfig()
    logger.info('新配置:', config)

    if (!config.enabled) {
      this.detachAudioListener()
      this.detector?.shutdown()
      this.detector = null
      logger.info('唤醒词已关闭，检测器已停用')
      return
    }

    const keywordsFile = ensureWakeWordKeywordsFile(config.language, config.keyword)
    const detectorConfig = this.buildDetectorConfig(config, keywordsFile)

    if (!this.detector) {
      this.detector = new WakeWordDetector(detectorConfig)
      this.attachDetectorCallbacks()
      if (this.detector.isEnabled()) {
        this.detector.setCooldown(config.cooldownMs)
        try {
          this.getDep<AudioPlugin>('AudioPlugin').addAudioListener(this.detector)
        }
        catch (error) {
          logger.warn('订阅音频流失败（插件可能尚未启动）', error)
        }
      }
      logger.info('检测器已按新配置创建')
      return
    }

    this.detector.reload(detectorConfig)
    if (this.detector.isEnabled())
      this.detector.setCooldown(config.cooldownMs)

    logger.info('配置重新加载完成')
  }

  async start(): Promise<void> {
    await super.start()

    if (!this.detector || !this.detector.isEnabled()) {
      logger.warn('检测器未初始化，跳过启动')
      return
    }

    this.getDep<AudioPlugin>('AudioPlugin').addAudioListener(this.detector)
    logger.info('已订阅音频流，开始监听唤醒词')
  }

  private async onWakeWordDetected(keyword: string): Promise<void> {
    logger.info(`唤醒词触发: "${keyword}"`)

    if (!this.ctx || !this.cmd) {
      logger.error('上下文未初始化')
      return
    }

    try {
      const deviceState = this.ctx.getDeviceState()
      const listeningMode = this.ctx.getListeningMode()
      logger.info(`当前状态: deviceState=${deviceState}, listeningMode=${listeningMode}`)

      if (deviceState === 'listening' && listeningMode === 'manual') {
        logger.info('检测到手动模式激活，停止手动模式')
        await this.cmd.stopListening()
      }

      if (deviceState === 'speaking') {
        logger.info('当前正在说话，打断输出')
        await this.cmd.abortSpeaking(AbortReason.USER_INTERRUPTED)

        const backgroundWindow = this.getDep<AudioPlugin>('AudioPlugin').getBackgroundAudioWindow()
        if (backgroundWindow && !backgroundWindow.isDestroyed()) {
          backgroundWindow.webContents.send('audio:command', 'clearQueue')
        }
      }

      const currentState = this.ctx.getDeviceState()
      const currentMode = this.ctx.getListeningMode()
      if (currentState === 'listening' && (currentMode === 'realtime' || currentMode === 'auto')) {
        logger.info('已在自动监听中，忽略唤醒词')
        return
      }

      logger.info('启动自动对话（进入聆听）')
      await this.cmd.startListening('realtime')

      if (getDatabase().getFormattedWakeWordConfig().greet) {
        logger.info('唤醒后问候：发送 listen/detect', { keyword })
        await this.cmd.sendWakeWordDetected(keyword)
      }
    }
    catch (error) {
      logger.error('处理唤醒词失败', error)
    }
  }

  async stop(): Promise<void> {
    this.detachAudioListener()
    await super.stop()
    logger.info('已停止')
  }

  async shutdown(): Promise<void> {
    this.detachAudioListener()
    this.detector?.shutdown()
    this.detector = null
    await super.shutdown()
    logger.info('已关闭')
  }
}
