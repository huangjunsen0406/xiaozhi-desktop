import type { PluginCommands, PluginContext } from '../core'
import type { AudioPlugin } from './AudioPlugin'
import path from 'node:path'
import process from 'node:process'
import { Events } from '../core'
import { AbortReason } from '../protocols/Protocol'
import { DatabaseManager } from '../services/database'
import { getLogger } from '../utils/logger'
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
  async setup(ctx: PluginContext, cmd: PluginCommands): Promise<void> {
    await super.setup(ctx, cmd)

    logger.info('开始设置...')

    try {
      const modelsPath = this.getModelsBasePath()
      logger.info('模型路径:', modelsPath)

      // 从数据库读取配置
      const db = DatabaseManager.getInstance()
      const config = db.getFormattedWakeWordConfig()

      logger.info('唤醒词配置:', config)

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
        logger.error('检测器错误', error)
      })

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
    if (!this.detector) {
      logger.warn('检测器未初始化，无法重新加载')
      return
    }

    logger.info('重新加载配置...')

    try {
      // 从数据库读取最新配置
      const db = DatabaseManager.getInstance()
      const config = db.getFormattedWakeWordConfig()

      logger.info('新配置:', config)

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

      logger.info('配置重新加载完成')
    }
    catch (error) {
      logger.error('配置重新加载失败', error)
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
        // 使用事件驱动等待状态变更而非固定延迟
        await this.waitForStateChange()
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

        // 使用事件驱动等待状态变更
        await this.waitForStateChange()
      }

      // 重新获取状态（可能已变化）
      const currentState = this.ctx.getDeviceState()
      const currentMode = this.ctx.getListeningMode()

      // 情况4: 已经在监听中（自动对话模式），忽略唤醒词（避免重复启动）
      if (currentState === 'listening' && (currentMode === 'realtime' || currentMode === 'auto')) {
        logger.info('已在自动监听中，忽略唤醒词')
        return
      }

      // 情况2 & 通用: 建立新连接并启动自动对话
      logger.info('启动自动对话')
      await this.cmd.startListening('realtime')
    }
    catch (error) {
      logger.error('处理唤醒词失败', error)
    }
  }

  /**
   * 等待设备状态变更
   * 使用 EventBus 监听状态变更事件，带超时保护
   */
  private waitForStateChange(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.ctx) {
        resolve()
        return
      }

      let resolved = false
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          resolve()
        }
      }, 500) // 500ms 超时保护

      this.ctx.eventBus.once(Events.DEVICE_STATE_CHANGED, () => {
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          resolve()
        }
      })
    })
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
