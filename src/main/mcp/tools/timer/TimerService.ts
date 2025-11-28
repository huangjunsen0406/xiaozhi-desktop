/**
 * 倒计时器服务
 * 管理倒计时任务的创建、执行、取消和状态查询
 */

import type {
  CancelCountdownResult,
  GetActiveTimersResult,
  MCPCommand,
  StartCountdownResult,
  TimerInfo,
} from './types'

/**
 * 单个倒计时任务
 */
class TimerTask {
  public readonly timerId: number
  public readonly command: string
  public readonly delay: number
  public readonly description: string
  public readonly startTime: Date
  public readonly executionTime: Date
  private timeout: NodeJS.Timeout | null = null
  private cancelled = false

  constructor(
    timerId: number,
    command: string,
    delay: number,
    description: string,
    private readonly onExecute: (task: TimerTask) => Promise<void>,
    private readonly onComplete: (timerId: number) => void,
  ) {
    this.timerId = timerId
    this.command = command
    this.delay = delay
    this.description = description
    this.startTime = new Date()
    this.executionTime = new Date(this.startTime.getTime() + delay * 1000)
  }

  /**
   * 启动倒计时任务
   */
  start(): void {
    this.timeout = setTimeout(async () => {
      if (!this.cancelled) {
        try {
          await this.onExecute(this)
        }
        catch (error) {
          console.error(`[TimerTask] Timer ${this.timerId} execution failed:`, error)
        }
        finally {
          this.onComplete(this.timerId)
        }
      }
    }, this.delay * 1000)

    console.log(`[TimerTask] Timer ${this.timerId} started, will execute in ${this.delay} seconds`)
  }

  /**
   * 取消倒计时任务
   */
  cancel(): void {
    if (this.timeout) {
      clearTimeout(this.timeout)
      this.timeout = null
      this.cancelled = true
      console.log(`[TimerTask] Timer ${this.timerId} cancelled`)
    }
  }

  /**
   * 获取剩余时间（秒）
   */
  getRemainingTime(): number {
    if (this.cancelled)
      return 0
    const now = new Date()
    const remaining = (this.executionTime.getTime() - now.getTime()) / 1000
    return Math.max(0, remaining)
  }

  /**
   * 获取进度（0-1）
   */
  getProgress(): number {
    if (this.cancelled)
      return 1
    const elapsed = (new Date().getTime() - this.startTime.getTime()) / 1000
    return Math.min(1, elapsed / this.delay)
  }

  /**
   * 获取任务信息
   */
  getInfo(): TimerInfo {
    return {
      timerId: this.timerId,
      command: this.command,
      delay: this.delay,
      description: this.description,
      startTime: this.startTime,
      executionTime: this.executionTime,
      remainingSeconds: this.getRemainingTime(),
      progress: this.getProgress(),
    }
  }

  /**
   * 检查任务是否已取消
   */
  isCancelled(): boolean {
    return this.cancelled
  }
}

/**
 * 倒计时器服务
 */
export class TimerService {
  private static instance: TimerService | null = null
  private timers = new Map<number, TimerTask>()
  private nextTimerId = 0
  private readonly DEFAULT_DELAY = 5

  private constructor() {
    console.log('[TimerService] Timer service initialized')
  }

  /**
   * 获取单例实例
   */
  static getInstance(): TimerService {
    if (!TimerService.instance) {
      TimerService.instance = new TimerService()
    }
    return TimerService.instance
  }

  /**
   * 启动倒计时任务
   */
  async startCountdown(
    command: string,
    delay?: number,
    description = '',
  ): Promise<StartCountdownResult> {
    // 使用默认延迟时间
    const actualDelay = delay ?? this.DEFAULT_DELAY

    // 验证延迟时间
    if (actualDelay <= 0 || actualDelay > 3600) {
      const message = `Invalid delay: ${actualDelay}. Must be between 1 and 3600 seconds.`
      console.error(`[TimerService] ${message}`)
      return { success: false, message }
    }

    // 验证命令格式
    try {
      const parsed = JSON.parse(command) as MCPCommand
      if (!parsed.name || !parsed.arguments) {
        throw new Error('Command must have "name" and "arguments" fields')
      }
    }
    catch (error) {
      const message = `Invalid command format: ${error instanceof Error ? error.message : 'Unknown error'}`
      console.error(`[TimerService] ${message}`)
      return { success: false, message }
    }

    // 创建倒计时任务
    const timerId = this.nextTimerId++

    const task = new TimerTask(
      timerId,
      command,
      actualDelay,
      description,
      async task => await this.executeCommand(task),
      id => this.cleanupTimer(id),
    )

    // 保存并启动任务
    this.timers.set(timerId, task)
    task.start()

    console.log(`[TimerService] Countdown ${timerId} started, will execute in ${actualDelay} seconds`)

    return {
      success: true,
      message: `Countdown ${timerId} started, will execute in ${actualDelay} seconds`,
      timerId,
      delay: actualDelay,
      command,
      description,
      startTime: task.startTime.toISOString(),
      estimatedExecutionTime: task.executionTime.toISOString(),
    }
  }

  /**
   * 取消倒计时任务
   */
  async cancelCountdown(timerId: number): Promise<CancelCountdownResult> {
    const task = this.timers.get(timerId)

    if (!task) {
      const message = `Timer ${timerId} not found or already completed`
      console.warn(`[TimerService] ${message}`)
      return { success: false, message, timerId }
    }

    task.cancel()
    this.timers.delete(timerId)

    const message = `Timer ${timerId} cancelled successfully`
    console.log(`[TimerService] ${message}`)

    return {
      success: true,
      message,
      timerId,
      cancelledAt: new Date().toISOString(),
    }
  }

  /**
   * 获取所有活动的倒计时任务
   */
  async getActiveTimers(): Promise<GetActiveTimersResult> {
    const activeTimers: TimerInfo[] = []

    for (const task of this.timers.values()) {
      if (!task.isCancelled() && task.getRemainingTime() > 0) {
        activeTimers.push(task.getInfo())
      }
    }

    console.log(`[TimerService] Found ${activeTimers.length} active timers`)

    return {
      success: true,
      totalActiveTimers: activeTimers.length,
      timers: activeTimers,
      currentTime: new Date().toISOString(),
    }
  }

  /**
   * 执行倒计时结束后的命令
   */
  private async executeCommand(task: TimerTask): Promise<void> {
    console.log(`[TimerService] Timer ${task.timerId} executing command: ${task.command}`)

    try {
      // 解析 MCP 工具调用命令
      const commandObj = JSON.parse(task.command) as MCPCommand

      // 获取 MCP Server 并执行工具
      const { McpServer } = await import('../../McpServer')
      const mcpServer = McpServer.getInstance()

      // 查找工具
      const tool = mcpServer.findTool(commandObj.name)

      if (!tool) {
        throw new Error(`MCP tool not found: ${commandObj.name}`)
      }

      // 执行 MCP 工具
      const result = await tool.callback(commandObj.arguments)

      console.log(`[TimerService] Timer ${task.timerId} executed successfully:`, result)

      // 通知执行结果
      await this.notifyExecutionResult(task, true, `Executed ${commandObj.name}`)
    }
    catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      console.error(`[TimerService] Timer ${task.timerId} execution failed:`, errorMsg)
      await this.notifyExecutionResult(task, false, errorMsg)
    }
  }

  /**
   * 通知执行结果（通过 TTS 播报）
   */
  private async notifyExecutionResult(
    task: TimerTask,
    success: boolean,
    _result: string,
  ): Promise<void> {
    try {
      // 获取 Application 实例并发送 TTS
      const { getApplication } = await import('../../../services/Application')
      const app = getApplication()

      let message = ''
      if (success) {
        message = task.description
          ? `${task.description}执行完成`
          : `倒计时 ${task.timerId} 执行完成`
      }
      else {
        message = task.description
          ? `${task.description}执行失败`
          : `倒计时 ${task.timerId} 执行失败`
      }

      console.log('[TimerService] Notifying:', message)
      await app.sendText(message)
    }
    catch (error) {
      console.warn('[TimerService] Failed to notify execution result:', error)
    }
  }

  /**
   * 清理已完成的计时器
   */
  private cleanupTimer(timerId: number): void {
    this.timers.delete(timerId)
    console.log(`[TimerService] Timer ${timerId} cleaned up`)
  }

  /**
   * 清理所有倒计时任务（应用关闭时调用）
   */
  async cleanupAll(): Promise<void> {
    console.log('[TimerService] Cleaning up all timers...')

    for (const task of this.timers.values()) {
      task.cancel()
    }

    this.timers.clear()
    console.log('[TimerService] All timers cleaned up')
  }

  /**
   * 获取活动计时器数量
   */
  getActiveTimerCount(): number {
    return this.timers.size
  }
}
