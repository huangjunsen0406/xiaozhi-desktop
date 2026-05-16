/**
 * 资源池
 *
 * 统一的资源注册与释放机制。所有需要清理的资源（音频流、网络连接、插件等）
 * 注册到池中，shutdown 时按注册的逆序统一释放。
 * 单个资源释放失败不阻塞后续资源的释放。
 */

import { getLogger } from '../utils/logger'

const logger = getLogger('ResourcePool')

/** 清理函数类型（支持同步和异步） */
type CleanupFn = () => void | Promise<void>

/**
 * 资源池 — 注册清理函数，逆序统一释放
 *
 * @example
 * ```typescript
 * const pool = new ResourcePool()
 *
 * // 注册资源（先注册的后释放）
 * pool.register('event_bus', () => eventBus.clear())
 * pool.register('plugins', () => pluginManager.shutdownAll())
 * pool.register('protocol', () => protocol.closeAudioChannel())
 *
 * // 关闭时逆序释放
 * await pool.shutdown()
 * // 释放顺序: protocol -> plugins -> event_bus
 * ```
 */
export class ResourcePool {
  /** 已注册的资源列表 */
  private resources: Array<{ name: string, cleanup: CleanupFn }> = []

  /** 防重入标志 */
  private shuttingDown: boolean = false

  /**
   * 注册一个清理函数
   *
   * @param name 资源名��（用于日志和排查）
   * @param cleanup 清理函数，可以是普通函数或 async 函数
   */
  register(name: string, cleanup: CleanupFn): void {
    if (this.shuttingDown) {
      logger.warn(`资源池正在关闭，跳过注册: ${name}`)
      return
    }
    this.resources.push({ name, cleanup })
    logger.debug(`注册资源: ${name}`)
  }

  /**
   * 释放所有已注册的资源
   *
   * 按注册顺序的逆序执行清理函数（先注册的后释放，模拟栈式 LIFO）。
   * 单个资源释放失败记录日志但不阻塞后续资源的释放。
   */
  async shutdown(): Promise<void> {
    if (this.shuttingDown) {
      logger.debug('资源池已在关闭中，跳过')
      return
    }
    this.shuttingDown = true

    logger.info(`开始释放 ${this.resources.length} 个资源...`)

    // 逆序释放
    const reversed = [...this.resources].reverse()
    for (const { name, cleanup } of reversed) {
      try {
        logger.debug(`释放资源: ${name}`)
        await cleanup()
      }
      catch (error) {
        logger.error(`释��资源失败 [${name}]:`, error)
      }
    }

    this.resources = []
    logger.info('资源池已清空')
  }

  /**
   * 获取已注册资源数量
   */
  getResourceCount(): number {
    return this.resources.length
  }

  /**
   * 是否正在关闭
   */
  isShuttingDown(): boolean {
    return this.shuttingDown
  }
}
