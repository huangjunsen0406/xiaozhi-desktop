/**
 * IPC 中间件模块
 * 提供统一的参数校验、错误处理和日志记录
 */
import type { IpcMainInvokeEvent } from 'electron'
import { ipcMain } from 'electron'

/**
 * 参数校验规则
 */
export interface ValidationRule {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  required?: boolean
  minLength?: number
  maxLength?: number
  min?: number
  max?: number
  pattern?: RegExp
  custom?: (value: unknown) => boolean | string
}

/**
 * 参数校验配置
 */
export type ValidationSchema = Record<string, ValidationRule>

/**
 * IPC 处理结果
 */
export interface IpcResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  code?: string
}

/**
 * IPC 处理器配置
 */
export interface IpcHandlerConfig {
  /** 通道名称 */
  channel: string
  /** 参数校验规则 */
  schema?: ValidationSchema
  /** 是否记录详细日志 */
  verbose?: boolean
  /** 处理器函数 */
  handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown> | unknown
}

/**
 * 验证参数
 */
function validateArgs(args: unknown[], schema: ValidationSchema): string | null {
  const keys = Object.keys(schema)

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    const rule = schema[key]
    const value = args[i]

    // 检查必填
    if (rule.required && (value === undefined || value === null)) {
      return `参数 ${key} 不能为空`
    }

    // 如果值为空且非必填，跳过后续验证
    if (value === undefined || value === null) {
      continue
    }

    // 检查类型
    if (rule.type === 'array') {
      if (!Array.isArray(value)) {
        return `参数 ${key} 必须是数组`
      }
    }
    else {
      // 类型检查 - 使用类型保护确保符合 typeof 的返回值
      const actualType = typeof value
      const expectedType = rule.type

      // 验证期望类型是否为 typeof 支持的类型
      const validTypes = ['string', 'number', 'boolean', 'object'] as const
      if (!validTypes.includes(expectedType as typeof validTypes[number])) {
        return `参数 ${key} 类型配置错误`
      }

      if (actualType !== expectedType) {
        return `参数 ${key} 类型错误，期望 ${expectedType}，实际 ${actualType}`
      }
    }

    // 字符串特定验证
    if (rule.type === 'string' && typeof value === 'string') {
      if (rule.minLength !== undefined && value.length < rule.minLength) {
        return `参数 ${key} 长度不能少于 ${rule.minLength}`
      }
      if (rule.maxLength !== undefined && value.length > rule.maxLength) {
        return `参数 ${key} 长度不能超过 ${rule.maxLength}`
      }
      if (rule.pattern && !rule.pattern.test(value)) {
        return `参数 ${key} 格式不正确`
      }
    }

    // 数字特定验证
    if (rule.type === 'number' && typeof value === 'number') {
      if (rule.min !== undefined && value < rule.min) {
        return `参数 ${key} 不能小于 ${rule.min}`
      }
      if (rule.max !== undefined && value > rule.max) {
        return `参数 ${key} 不能大于 ${rule.max}`
      }
    }

    // 自定义验证
    if (rule.custom) {
      const result = rule.custom(value)
      if (result !== true) {
        return typeof result === 'string' ? result : `参数 ${key} 校验失败`
      }
    }
  }

  return null
}

/**
 * 格式化错误消息
 */
function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

/**
 * 创建带中间件的 IPC 处理器
 */
export function createIpcHandler(config: IpcHandlerConfig): void {
  const { channel, schema, verbose = false, handler } = config
  const prefix = `[IPC:${channel}]`

  ipcMain.handle(channel, async (event, ...args) => {
    const startTime = Date.now()

    try {
      // 参数校验
      if (schema) {
        const validationError = validateArgs(args, schema)
        if (validationError) {
          console.warn(`${prefix} 参数校验失败: ${validationError}`)
          return {
            success: false,
            error: validationError,
            code: 'VALIDATION_ERROR',
          } as IpcResponse
        }
      }

      // 执行处理器
      if (verbose) {
        console.log(`${prefix} 开始处理`, args)
      }

      const result = await handler(event, ...args)

      // 记录执行时间
      const duration = Date.now() - startTime
      if (verbose || duration > 1000) {
        console.log(`${prefix} 处理完成 (${duration}ms)`)
      }

      return result
    }
    catch (error) {
      const duration = Date.now() - startTime
      console.error(`${prefix} 处理失败 (${duration}ms):`, error)

      return {
        success: false,
        error: formatError(error),
        code: 'HANDLER_ERROR',
      } as IpcResponse
    }
  })
}

/**
 * 创建简单的 IPC 处理器（无参数校验）
 */
export function createSimpleHandler<T>(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<T> | T,
): void {
  createIpcHandler({
    channel,
    handler,
  })
}

/**
 * 批量注册 IPC 处理器
 */
export function registerIpcHandlers(configs: IpcHandlerConfig[]): void {
  for (const config of configs) {
    createIpcHandler(config)
  }
}

/**
 * 创建标准成功响应
 */
export function success<T>(data?: T): IpcResponse<T> {
  return {
    success: true,
    data,
  }
}

/**
 * 创建标准失败响应
 */
export function failure(error: string, code?: string): IpcResponse {
  return {
    success: false,
    error,
    code,
  }
}
