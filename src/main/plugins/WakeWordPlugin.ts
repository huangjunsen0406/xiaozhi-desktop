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

/**
 * 唤醒词插件
 * 负责检测唤醒词并触发自动对话
 */
export class WakeWordPlugin extends Plugin {
  readonly name = 'WakeWordPlugin'
  readonly priority = 35 // 在 AudioPlugin(10) 之后启动

  static readonly dependencies: string[] = ['AudioPlugin']

  readonly metadata = {
    name: 'WakeWordPlugin',
    version: '1.0.0',
    description: '唤醒词检测插件，基于 Sherpa-ONNX',
    author: 'Junsen',
  }

  private detector: WakeWordDetector | null = null
  private pendingTimer: NodeJS.Timeout | null = null

  /**
   * 打包内置模型根目录（onnx / tokens，只读）
   */
  private getModelsBasePath(): string {
    return getWakeWordModelsBundledDir()
  }

  /**
   * 从 DB 配置构建 detector 配置，并确保 userData keywords.txt 已生成
   */
  private buildDetectorConfig(config: {
    language: string
    keyword: string
    score: number
    threshold: number
  }): {
    language: string
    modelsBasePath: string
    keywordsFile: string
    keyword: string
    numThreads: number
    maxActivePaths: number
    keywordsScore: number
    keywordsThreshold: number
    numTrailingBlanks: number
  } {
    const modelsPath = this.getModelsBasePath()
    const keywordsFile = ensureWakeWordKeywordsFile(config.language, config.keyword)

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
      this.onWakeWordDetected(keyword)
    })
    this.detector.onError((error) => {
      logger.error('检测器错误', error)
    })
  }

  /**
   * 插件初始化
   */
  async setup(ctx: PluginContext, cmd: PluginCommands): Promise<void> {
    await super.setup(ctx, cmd)

    logger.info('开始设置...')

    try {
      // 从数据库读取配置
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
        if (config.language === 'en')
          db.updateWakeWordConfig({ keyword_en: safe.keyword })
        else
          db.updateWakeWordConfig({ keyword_zh: safe.keyword })
      }

      this.detector = new WakeWordDetector(this.buildDetectorConfig({
        ...config,
        keyword: safe.keyword,
      }))

      // 设置冷却时间
      if (this.detector.isEnabled()) {
        this.detector.setCooldown(config.cooldownMs)
      }

      this.attachDetectorCallbacks()

      if (this.detector.isEnabled()) {
        logger.info('设置完成')
      }
      else {
        logger.warn('检测器未启用（可能模型文件缺失）')
      }
    }
    catch (error) {
      logger.error('设置失败', error)
      this.detector = null
    }
  }

  /**
   * 重新加载配置（用于热更新）
   */
  async reloadConfig(): Promise<void> {
    logger.info('重新加载配置...')

    try {
      const db = getDatabase()
      const config = db.getFormattedWakeWordConfig()
      logger.info('新配置:', config)

      if (!config.enabled) {
        if (this.detector) {
          try {
            const audioPlugin = this.getDep<AudioPlugin>('AudioPlugin')
            audioPlugin.removeAudioListener(this.detector)
          }
          catch {
            // 依赖可能未就绪
          }
          this.detector.shutdown()
          this.detector = null
        }
        logger.info('唤醒词已关闭，检测器已停用')
        return
      }

      const detectorConfig = this.buildDetectorConfig(config)

      if (!this.detector) {
        this.detector = new WakeWordDetector(detectorConfig)
        this.attachDetectorCallbacks()
        if (this.detector.isEnabled()) {
          this.detector.setCooldown(config.cooldownMs)
          try {
            const audioPlugin = this.getDep<AudioPlugin>('AudioPlugin')
            audioPlugin.addAudioListener(this.detector)
          }
          catch (error) {
            logger.warn('订阅音频流失败（插件可能尚未启动）', error)
          }
        }
        logger.info('检测器已按新配置创建')
        return
      }

      this.detector.reload(detectorConfig)
      if (this.detector.isEnabled()) {
        this.detector.setCooldown(config.cooldownMs)
      }

      logger.info('配置重新加载完成')
    }
    catch (error) {
      logger.error('配置重新加载失败', error)
      throw error
    }
  }

  /**
   * 插件启动
   */
  async start(): Promise<void> {
    await super.start()

    if (!this.detector || !this.detector.isEnabled()) {
      logger.warn('检测器未初始化，跳过启动')
      return
    }

    // 通过声明式依赖获取 AudioPlugin
    const audioPlugin = this.getDep<AudioPlugin>('AudioPlugin')
    audioPlugin.addAudioListener(this.detector)
    logger.info('已订阅音频流')

    logger.info('音频系统将自动启动，开始监听唤醒词')
  }

  /**
   * 唤醒词检测回调
   *
   * 行为规则：
   * 1. 说话中（SPEAKING）-> 打断 -> 进入自动对话
   * 2. 空闲（IDLE）且断开连接 -> 连接 -> 进入自动对话
   * 3. 手动监听（LISTENING + manual）-> 停止手动 -> 进入自动对话
   * 4. 监听中（LISTENING + auto/realtime）-> 忽略（避免重复启动）
   */
  private async onWakeWordDetected(keyword: string): Promise<void> {
    logger.info(`唤醒词触发: "${keyword}"`)

    if (!this.ctx || !this.cmd) {
      logger.error('上下文未初始化')
      return
    }

    try {
      // 获取当前状态
      const deviceState = this.ctx.getDeviceState()
      const listeningMode = this.ctx.getListeningMode()

      logger.info(`当前状态: deviceState=${deviceState}, listeningMode=${listeningMode}`)

      // 情况3: 手动监听中，先停止手动模式
      if (deviceState === 'listening' && listeningMode === 'manual') {
        logger.info('检测到手动模式激活，停止手动模式')
        await this.cmd.stopListening()
      }

      // 情况1: 说话中，打断语音输出（包括半双工和全双工）
      if (deviceState === 'speaking') {
        logger.info('当前正在说话，打断输出')
        await this.cmd.abortSpeaking(AbortReason.USER_INTERRUPTED)

        // 清空音频播放队列
        const audioPlugin = this.getDep<AudioPlugin>('AudioPlugin')
        const backgroundWindow = audioPlugin.getBackgroundAudioWindow()
        if (backgroundWindow && !backgroundWindow.isDestroyed()) {
          backgroundWindow.webContents.send('audio:command', 'clearQueue')
        }
      }

      // 重新获取状态（可能已变化）
      const currentState = this.ctx.getDeviceState()
      const currentMode = this.ctx.getListeningMode()

      // 情况4: 已经在监听中（自动对话模式），忽略唤醒词（避免重复启动）
      if (currentState === 'listening' && (currentMode === 'realtime' || currentMode === 'auto')) {
        logger.info('已在自动监听中，忽略唤醒词')
        return
      }

      // 默认：建立连接并进入聆听（listen/start），小智待命不主动说话
      logger.info('启动自动对话（进入聆听）')
      await this.cmd.startListening('realtime')

      const greet = getDatabase().getFormattedWakeWordConfig().greet
      if (greet) {
        logger.info('唤醒后问候：发送 listen/detect', { keyword })
        await this.cmd.sendWakeWordDetected(keyword)
      }
    }
    catch (error) {
      logger.error('处理唤醒词失败', error)
    }
  }

  /**
   * 插件停止
   */
  async stop(): Promise<void> {
    // 清理 pending timer
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer)
      this.pendingTimer = null
    }

    if (this.detector) {
      try {
        const audioPlugin = this.getDep<AudioPlugin>('AudioPlugin')
        audioPlugin.removeAudioListener(this.detector)
        logger.info('已取消订阅音频流')
      }
      catch {
        // 依赖可能已关闭，忽略
      }
    }

    await super.stop()
    logger.info('已停止')
  }

  /**
   * 插件关闭
   */
  async shutdown(): Promise<void> {
    // 清理 pending timer
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer)
      this.pendingTimer = null
    }

    if (this.detector) {
      try {
        const audioPlugin = this.getDep<AudioPlugin>('AudioPlugin')
        audioPlugin.removeAudioListener(this.detector)
      }
      catch {
        // 依赖可能已关闭，忽略
      }

      this.detector.shutdown()
      this.detector = null
    }

    await super.shutdown()
    logger.info('已关闭')
  }
}
