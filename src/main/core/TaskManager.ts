import { getLogger } from '../utils/logger'

const logger = getLogger('TaskManager')

/** 追踪已启动任务，关闭时停止启动新工作并等待现有工作；不伪装成取消 Promise。 */
export class TaskManager {
  private tasks = new Map<string, Promise<unknown>>()
  private taskIdCounter = 0
  private running = true
  private shutdownResolve: (() => void) | null = null
  private readonly shutdownPromise: Promise<void>

  constructor() {
    this.shutdownPromise = new Promise<void>((resolve) => {
      this.shutdownResolve = resolve
    })
  }

  /** 已启动的 Promise 即使在关闭阶段也必须被追踪，并保留原始结果。 */
  track<T>(promise: Promise<T>, name: string): Promise<T> {
    const taskId = `${name}:${++this.taskIdCounter}`
    const tracked = promise.catch((error) => {
      logger.error(`任务 ${taskId} 异常:`, error)
      throw error
    }).finally(() => {
      this.tasks.delete(taskId)
    })
    this.tasks.set(taskId, tracked)
    return tracked
  }

  /** 工厂仅在允许启动新任务时执行；拒绝用 undefined 冒充任务结果。 */
  run<T>(work: () => T | Promise<T>, name: string): Promise<T> {
    if (!this.running)
      return Promise.reject(new Error(`应用正在关闭，无法启动任务: ${name}`))
    return this.track(Promise.resolve().then(work), name)
  }

  requestShutdown(): void {
    this.running = false
    this.shutdownResolve?.()
    this.shutdownResolve = null
  }

  waitShutdown(): Promise<void> {
    return this.shutdownPromise
  }

  /** 超时只结束等待；未完成任务继续保留追踪，完成后自行移除。 */
  async drain(timeoutMs = 5000): Promise<void> {
    this.requestShutdown()
    if (!this.tasks.size)
      return

    let timer: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), timeoutMs)
    })
    try {
      while (this.tasks.size) {
        const result = await Promise.race([
          Promise.allSettled([...this.tasks.values()]),
          deadline,
        ])
        if (result === 'timeout') {
          logger.warn(`等待任务超时，${this.tasks.size} 个任务未完成`)
          return
        }
      }
    }
    finally {
      if (timer)
        clearTimeout(timer)
    }
  }

  getActiveCount(): number {
    return this.tasks.size
  }

  getTaskNames(): string[] {
    return [...this.tasks.keys()]
  }

  isRunning(): boolean {
    return this.running
  }
}
