/**
 * 异步任务管理器
 *
 * 统一管理异步任务的创建、追踪和清理。
 * 提供协作式关闭机制，确保应用退出时所有任务正确完成或取消。
 */

import { getLogger } from '../utils/logger'

const logger = getLogger('TaskManager')

/**
 * 异步任务管理器
 *
 * 职责:
 * - 创建和追踪异步任务（Promise）
 * - 关闭时统一等待或超时取消
 * - 提供关闭信号（requestShutdown / waitShutdown）
 *
 * @example
 * ```typescript
 * const tm = new TaskManager()
 *
 * // 创建追踪任务
 * const result = await tm.spawn(fetchData(), 'fetch:data')
 *
 * // 协作式关闭
 * tm.requestShutdown()
 * await tm.cancelAll(5000)
 * ```
 */
export class TaskManager {
  /** 活跃任务映射（taskId -> Promise） */
  private tasks = new Map<string, Promise<unknown>>()

  /** 任务 ID 计数器 */
  private taskIdCounter: number = 0

  /** 是否正在运行 */
  private running: boolean = true

  /** 关闭信号 resolve 函数 */
  private shutdownResolve: (() => void) | null = null

  /** 关闭 Promise（外部可 await 等待关闭信号） */
  private shutdownPromise: Promise<void>

  constructor() {
    this.shutdownPromise = new Promise<void>((resolve) => {
      this.shutdownResolve = resolve
    })
  }

  /**
   * 创建并追踪异步任务
   *
   * 任务完成后自动从追踪列表中移除。
   * 如果应用正在关闭，直接返回 resolve(undefined)。
   *
   * @param promise 要追踪的 Promise
   * @param name 任务名称（用于日志和调试）
   * @returns 原始 Promise（带追踪逻辑）
   */
  spawn<T>(promise: Promise<T>, name: string): Promise<T> {
    if (!this.running) {
      logger.debug(`跳过任务创建（应用正在关闭）: ${name}`)
      return Promise.resolve(undefined as T)
    }

    const taskId = `${name}:${++this.taskIdCounter}`

    const trackedPromise = promise
      .catch((error) => {
        logger.error(`任务 ${taskId} 异常:`, error)
        throw error
      })
      .finally(() => {
        this.tasks.delete(taskId)
      })

    this.tasks.set(taskId, trackedPromise)
    return trackedPromise as Promise<T>
  }

  /**
   * 请求关闭
   *
   * 触发关闭信号，��知所有等待者应用即将退出。
   */
  requestShutdown(): void {
    if (this.shutdownResolve) {
      logger.info('收到关闭请求')
      this.shutdownResolve()
      this.shutdownResolve = null
    }
  }

  /**
   * 等待关闭信号
   *
   * 阻塞直到 requestShutdown() 被调用。
   */
  waitShutdown(): Promise<void> {
    return this.shutdownPromise
  }

  /**
   * 取消所有任务并等待完成
   *
   * 设置 running = false 阻止新任务创建，
   * 然后等待现有任务完成（带超时保护）。
   *
   * @param timeout 超时时间（毫秒），默认 5000ms
   */
  async cancelAll(timeout: number = 5000): Promise<void> {
    this.running = false

    // 触发关闭信号
    if (this.shutdownResolve) {
      this.shutdownResolve()
      this.shutdownResolve = null
    }

    if (this.tasks.size === 0)
      return

    logger.info(`等待 ${this.tasks.size} 个任务完成...`)
    const taskNames = Array.from(this.tasks.keys())
    logger.info(`活跃任务: ${taskNames.join(', ')}`)

    // 超时保护
    const timeoutPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        if (this.tasks.size > 0) {
          logger.warn(`等待任务超时，${this.tasks.size} 个任务未完成`)
        }
        resolve()
      }, timeout)
    })

    await Promise.race([
      Promise.allSettled(this.tasks.values()),
      timeoutPromise,
    ])

    this.tasks.clear()
    logger.info('所有任务已清理')
  }

  /**
   * 获取当前活跃任务数量
   */
  getActiveCount(): number {
    return this.tasks.size
  }

  /**
   * 获取所有活跃任务名称
   */
  getTaskNames(): string[] {
    return Array.from(this.tasks.keys())
  }

  /**
   * 是否正在运行（未进入关闭流程）
   */
  isRunning(): boolean {
    return this.running
  }
}
