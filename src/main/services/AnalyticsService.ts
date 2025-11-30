/**
 * LightDot 埋点服务
 * 负责收集、缓存和上报应用事件到 Supabase
 */

import { randomUUID } from 'node:crypto'
import os from 'node:os'
import process from 'node:process'
import { app, screen } from 'electron'
import { v5 as uuidv5 } from 'uuid'
import { getLogger } from '../utils/logger'
import { DeviceFingerprintManager } from './deviceFingerprintDB'

interface EventPayload {
  user_id: string
  session_id: string
  event: string
  ts: string
  os_platform?: string
  os_release?: string
  os_arch?: string
  app_version?: string
  language?: string
  screen_resolution?: string
  extra?: Record<string, unknown>
}

interface AnalyticsConfig {
  enabled: boolean
  endpoint: string
  token: string
  flushInterval: number // 发送间隔(ms)
  flushBatchSize: number // 批量发送大小
}

export class AnalyticsService {
  private static instance: AnalyticsService | null = null

  private config: AnalyticsConfig = {
    enabled: true,
    endpoint: 'https://ywvzubcpdwgxpttoxwhm.supabase.co/functions/v1/bright-task',
    token: 'junsen-track-2024-LightDot',
    flushInterval: 30000, // 30秒
    flushBatchSize: 50, // 50条事件
  }

  private userId: string = ''
  private sessionId: string = ''
  private systemInfo: Partial<EventPayload> = {}

  private eventQueue: EventPayload[] = []
  private flushTimer: NodeJS.Timeout | null = null
  private isInitialized: boolean = false
  private isShuttingDown: boolean = false
  private logger = getLogger('Analytics')

  private constructor() {}

  static getInstance(): AnalyticsService {
    if (!AnalyticsService.instance) {
      AnalyticsService.instance = new AnalyticsService()
    }
    return AnalyticsService.instance
  }

  /**
   * 初始化埋点服务
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    try {
      // 生成用户标识
      await this.generateUserId()

      // 生成会话标识
      this.sessionId = randomUUID()

      // 收集系统信息
      this.collectSystemInfo()

      // 启动定时发送
      this.startFlushTimer()

      this.isInitialized = true

      // 从离线缓存恢复事件
      await this.recoverOfflineEvents()

      this.logger.info('埋点服务已初始化', {
        userId: `${this.userId.substring(0, 8)}...`,
        sessionId: `${this.sessionId.substring(0, 8)}...`,
        endpoint: this.config.endpoint,
      })
    }
    catch (error) {
      this.logger.error('埋点服务初始化失败', error)
    }
  }

  /**
   * 生成稳定的用户 UUID (基于设备指纹)
   */
  private async generateUserId(): Promise<void> {
    try {
      const fingerprintManager = await DeviceFingerprintManager.getInstanceAsync()
      const serialNumber = fingerprintManager.getSerialNumber()

      // 使用 UUID v5 生成稳定的 UUID
      const UUID_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
      this.userId = uuidv5(serialNumber, UUID_NAMESPACE)
    }
    catch (error) {
      this.logger.error('生成用户 ID 失败,使用随机 UUID', error)
      this.userId = randomUUID()
    }
  }

  /**
   * 收集系统信息
   */
  private collectSystemInfo(): void {
    try {
      const primaryDisplay = screen.getPrimaryDisplay()
      const { width, height } = primaryDisplay.size

      this.systemInfo = {
        os_platform: process.platform,
        os_release: os.release(),
        os_arch: process.arch,
        app_version: app.getVersion(),
        language: app.getLocale(),
        screen_resolution: `${width}x${height}`,
      }
    }
    catch (error) {
      this.logger.error('收集系统信息失败', error)
    }
  }

  /**
   * 上报事件
   */
  track(event: string, extra?: Record<string, unknown>): void {
    if (!this.config.enabled || this.isShuttingDown) {
      return
    }

    if (!this.isInitialized) {
      this.logger.warn('埋点服务未初始化,事件被忽略:', event)
      return
    }

    try {
      const payload: EventPayload = {
        user_id: this.userId,
        session_id: this.sessionId,
        event,
        ts: new Date().toISOString(),
        ...this.systemInfo,
        extra,
      }

      this.eventQueue.push(payload)

      // 队列达到批量大小时立即发送
      if (this.eventQueue.length >= this.config.flushBatchSize) {
        this.flush()
      }
    }
    catch (error) {
      this.logger.error('上报事件失败', error)
    }
  }

  /**
   * 启动定时发送
   */
  private startFlushTimer(): void {
    if (this.flushTimer) {
      return
    }

    this.flushTimer = setInterval(() => {
      this.flush()
    }, this.config.flushInterval)
  }

  /**
   * 停止定时发送
   */
  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
  }

  /**
   * 立即发送队列中的事件
   */
  async flush(): Promise<void> {
    if (this.eventQueue.length === 0) {
      return
    }

    const events = [...this.eventQueue]
    this.eventQueue = []

    try {
      await this.sendToSupabase(events)
      this.logger.debug(`成功发送 ${events.length} 个事件`)
    }
    catch (error) {
      this.logger.error('发送事件失败,保存到离线缓存', error)
      await this.saveOffline(events)
    }
  }

  /**
   * 发送事件到 Supabase Edge Function
   */
  private async sendToSupabase(events: EventPayload[]): Promise<void> {
    if (events.length === 0) {
      return
    }

    // 限制批量大小为 200 (Edge Function 限制)
    const chunks = this.chunkArray(events, 200)

    for (const chunk of chunks) {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Track-Token': this.config.token,
        },
        body: JSON.stringify(chunk),
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`发送失败: ${response.status} ${text}`)
      }

      const result = await response.json()
      this.logger.debug('发送结果:', result)
    }
  }

  /**
   * 保存事件到离线缓存 (SQLite)
   */
  private async saveOffline(_events: EventPayload[]): Promise<void> {
    try {
      // DatabaseManager 没有暴露直接的 SQL 操作,暂时跳过离线缓存
      // TODO: 扩展 DatabaseManager 添加 analytics 相关的方法
      this.logger.warn('离线缓存功能暂未实现,事件已丢失')
    }
    catch (error) {
      this.logger.error('保存离线缓存失败', error)
    }
  }

  /**
   * 恢复离线事件并重试发送
   */
  private async recoverOfflineEvents(): Promise<void> {
    try {
      // TODO: 等待 DatabaseManager 扩展后实现
      this.logger.debug('离线事件恢复功能暂未实现')
    }
    catch (error) {
      this.logger.error('恢复离线事件失败', error)
    }
  }

  /**
   * 关闭服务 (应用退出时调用)
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true
    this.stopFlushTimer()

    this.logger.info('埋点服务正在关闭...')

    // 发送剩余事件
    await this.flush()

    this.logger.info('埋点服务已关闭')
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<AnalyticsConfig>): void {
    this.config = { ...this.config, ...config }
    this.logger.info('埋点配置已更新', config)

    // 重启定时器
    if (config.flushInterval !== undefined) {
      this.stopFlushTimer()
      this.startFlushTimer()
    }
  }

  /**
   * 获取配置
   */
  getConfig(): AnalyticsConfig {
    return { ...this.config }
  }

  /**
   * 数组分块工具
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }
}

/**
 * 获取埋点服务单例
 */
export function getAnalyticsService(): AnalyticsService {
  return AnalyticsService.getInstance()
}
