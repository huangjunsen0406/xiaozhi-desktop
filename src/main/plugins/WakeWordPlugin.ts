import type { Application } from '../services/Application'
import path from 'node:path'
import process from 'node:process'
import { AbortReason } from '../protocols/Protocol'
import { WakeWordDetector } from '../wake-word/WakeWordDetector'
import { Plugin } from './Plugin'

/**
 * 唤醒词插件
 * 负责检测唤醒词并触发自动对话
 */
export class WakeWordPlugin extends Plugin {
  readonly name = 'WakeWordPlugin'
  readonly priority = 35 // 在 AudioPlugin(10) 之后启动

  readonly metadata = {
    name: 'WakeWordPlugin',
    version: '1.0.0',
    description: '唤醒词检测插件，基于 Sherpa-ONNX',
    author: 'Junsen',
  }

  private detector: WakeWordDetector | null = null

  /**
   * 获取模型基础路径
   */
  private getModelsBasePath(): string {
    const isDev = process.env.NODE_ENV === 'development'
    return isDev
      ? path.join(__dirname, '../../resources/wake-word-models')
      : path.join(process.resourcesPath, 'wake-word-models')
  }

  /**
   * 插件初始化
   */
  async setup(app: Application): Promise<void> {
    await super.setup(app)

    console.log('[WakeWordPlugin] 开始设置...')

    try {
      const modelsPath = this.getModelsBasePath()
      console.log('[WakeWordPlugin] 模型路径:', modelsPath)

      // 从数据库读取配置
      const { DatabaseManager } = await import('../services/database')
      const db = DatabaseManager.getInstance()
      const config = db.getFormattedWakeWordConfig()

      console.log('[WakeWordPlugin] 唤醒词配置:', config)

      // 创建检测器
      this.detector = new WakeWordDetector({
        language: config.language,
        modelsBasePath: modelsPath,
        keyword: config.keyword,
        numThreads: 4,
        maxActivePaths: 2,
        keywordsScore: config.score,
        keywordsThreshold: config.threshold,
        numTrailingBlanks: 1,
      })

      // 设置冷却时间
      if (this.detector.isEnabled()) {
        this.detector.setCooldown(config.cooldownMs)
      }

      // 绑定回调
      this.detector.onDetected((keyword) => {
        this.onWakeWordDetected(keyword)
      })

      this.detector.onError((error) => {
        console.error('[WakeWordPlugin] 检测器错误:', error)
      })

      if (this.detector.isEnabled()) {
        console.log('[WakeWordPlugin] ✓ 设置完成')
      }
      else {
        console.warn('[WakeWordPlugin] ✗ 检测器未启用（可能模型文件缺失）')
      }
    }
    catch (error) {
      console.error('[WakeWordPlugin] ✗ 设置失败:', error)
      this.detector = null
    }
  }

  /**
   * 重新加载配置（用于热更新）
   */
  async reloadConfig(): Promise<void> {
    if (!this.detector) {
      console.warn('[WakeWordPlugin] 检测器未初始化，无法重新加载')
      return
    }

    console.log('[WakeWordPlugin] 重新加载配置...')

    try {
      // 从数据库读取最新配置
      const { DatabaseManager } = await import('../services/database')
      const db = DatabaseManager.getInstance()
      const config = db.getFormattedWakeWordConfig()

      console.log('[WakeWordPlugin] 新配置:', config)

      // 重新加载模型
      this.detector.reload({
        language: config.language,
        modelsBasePath: this.getModelsBasePath(),
        keyword: config.keyword,
        numThreads: 4,
        maxActivePaths: 2,
        keywordsScore: config.score,
        keywordsThreshold: config.threshold,
        numTrailingBlanks: 1,
      })

      // 更新冷却时间
      if (this.detector.isEnabled()) {
        this.detector.setCooldown(config.cooldownMs)
      }

      console.log('[WakeWordPlugin] ✓ 配置重新加载完成')
    }
    catch (error) {
      console.error('[WakeWordPlugin] ✗ 配置重新加载失败:', error)
    }
  }

  /**
   * 插件启动
   */
  async start(): Promise<void> {
    await super.start()

    if (!this.detector || !this.detector.isEnabled()) {
      console.warn('[WakeWordPlugin] 检测器未初始化，跳过启动')
      return
    }

    // 订阅 AudioPlugin 的音频流
    const audioPlugin = this.app?.getAudioPlugin()
    if (!audioPlugin) {
      console.error('[WakeWordPlugin] 未找到 AudioPlugin，无法启动')
      return
    }

    audioPlugin.addAudioListener(this.detector)
    console.log('[WakeWordPlugin] ✓ 已订阅音频流')

    // 启动后台音频采集（用于唤醒词检测）
    await this.startBackgroundAudioCapture(audioPlugin)
  }

  /**
   * 启动后台音频采集
   */
  private async startBackgroundAudioCapture(audioPlugin: any): Promise<void> {
    const backgroundWindow = audioPlugin.getBackgroundAudioWindow()
    if (!backgroundWindow || backgroundWindow.isDestroyed()) {
      console.warn('[WakeWordPlugin] 后台音频窗口未找到')
      return
    }

    // 等待窗口完全加载完成
    if (!backgroundWindow.webContents.isLoading()) {
      // 已经加载完成，直接启动
      this.sendAudioCommands(backgroundWindow)
    }
    else {
      // 等待加载完成
      console.log('[WakeWordPlugin] 等待后台音频窗口加载完成...')
      backgroundWindow.webContents.once('did-finish-load', () => {
        console.log('[WakeWordPlugin] 后台音频窗口已加载')
        // 等待一小段时间确保页面完全初始化
        setTimeout(() => {
          this.sendAudioCommands(backgroundWindow)
        }, 500)
      })
    }
  }

  /**
   * 发送音频启动指令
   */
  private sendAudioCommands(backgroundWindow: any): void {
    if (backgroundWindow.isDestroyed()) {
      console.warn('[WakeWordPlugin] 窗口已销毁，无法启动音频')
      return
    }

    console.log('[WakeWordPlugin] 启动后台音频采集...')
    // 直接启动采集，会自动使用配置的设备
    backgroundWindow.webContents.send('audio:command', 'start')
    console.log('[WakeWordPlugin] ✓ 已启动后台音频采集，开始监听唤醒词')
  }

  /**
   * 唤醒词检测回调
   */
  private async onWakeWordDetected(keyword: string): Promise<void> {
    console.log(`[WakeWordPlugin] 🎤 唤醒词触发: "${keyword}"`)

    if (!this.app) {
      console.error('[WakeWordPlugin] Application 未初始化')
      return
    }

    try {
      if (this.app.isSpeaking()) {
        // 正在说话 → 打断语音输出
        console.log('[WakeWordPlugin] 当前正在说话，打断输出')
        await this.app.abortSpeaking(AbortReason.USER_INTERRUPTED)

        // 清空音频播放队列
        const audioPlugin = this.app.getAudioPlugin()
        const backgroundWindow = audioPlugin?.getBackgroundAudioWindow()
        if (backgroundWindow && !backgroundWindow.isDestroyed()) {
          backgroundWindow.webContents.send('audio:command', 'clearQueue')
        }

        // 等待一小段时间让音频完全停止
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      // 启动自动对话
      console.log('[WakeWordPlugin] 启动自动对话')
      await this.app.startAutoConversation()
    }
    catch (error) {
      console.error('[WakeWordPlugin] 处理唤醒词失败:', error)
    }
  }

  /**
   * 插件停止
   */
  async stop(): Promise<void> {
    if (this.detector) {
      const audioPlugin = this.app?.getAudioPlugin()
      if (audioPlugin) {
        audioPlugin.removeAudioListener(this.detector)
        console.log('[WakeWordPlugin] 已取消订阅音频流')
      }
    }

    await super.stop()
    console.log('[WakeWordPlugin] ✓ 已停止')
  }

  /**
   * 插件关闭
   */
  async shutdown(): Promise<void> {
    if (this.detector) {
      const audioPlugin = this.app?.getAudioPlugin()
      if (audioPlugin) {
        audioPlugin.removeAudioListener(this.detector)
      }

      this.detector.shutdown()
      this.detector = null
    }

    await super.shutdown()
    console.log('[WakeWordPlugin] ✓ 已关闭')
  }
}
