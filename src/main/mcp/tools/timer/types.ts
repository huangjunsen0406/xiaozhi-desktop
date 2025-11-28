/**
 * Timer 工具类型定义
 */

/**
 * MCP 工具调用命令
 */
export interface MCPCommand {
  /** MCP 工具名称 */
  name: string
  /** MCP 工具参数 */
  arguments: Record<string, unknown>
}

/**
 * 倒计时器信息
 */
export interface TimerInfo {
  /** 计时器 ID */
  timerId: number
  /** 要执行的命令（JSON 字符串） */
  command: string
  /** 延迟时间（秒） */
  delay: number
  /** 任务描述 */
  description: string
  /** 开始时间 */
  startTime: Date
  /** 预计执行时间 */
  executionTime: Date
  /** 剩余时间（秒） */
  remainingSeconds: number
  /** 进度（0-1） */
  progress: number
}

/**
 * 启动倒计时结果
 */
export interface StartCountdownResult {
  success: boolean
  message: string
  timerId?: number
  delay?: number
  command?: string
  description?: string
  startTime?: string
  estimatedExecutionTime?: string
}

/**
 * 取消倒计时结果
 */
export interface CancelCountdownResult {
  success: boolean
  message: string
  timerId?: number
  cancelledAt?: string
}

/**
 * 获取活动倒计时结果
 */
export interface GetActiveTimersResult {
  success: boolean
  totalActiveTimers: number
  timers: TimerInfo[]
  currentTime: string
}
