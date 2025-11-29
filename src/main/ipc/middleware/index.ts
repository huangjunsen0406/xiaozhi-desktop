import type { IpcResult } from '@shared/types'
import type { IpcMainInvokeEvent } from 'electron'
import { ipcMain } from 'electron'

/**
 * IPC 参数验证规则
 * 支持类型检查、必填校验、长度/范围限制、正则匹配、自定义校验
 */
export interface ValidationRule {
  /** 参数类型 */
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  /** 是否必填 */
  required?: boolean
  /** 字符串最小长度 */
  minLength?: number
  /** 字符串最大长度 */
  maxLength?: number
  /** 数字最小值 */
  min?: number
  /** 数字最大值 */
  max?: number
  /** 正则表达式匹配模式（用于字符串） */
  pattern?: RegExp
  /** 自定义校验函数，返回 true 表示通过，返回 string 表示错误信息 */
  custom?: (value: unknown) => boolean | string
}

/**
 * 验证规则集合
 * key 为参数名称，value 为对应的验证规则
 */
export type ValidationSchema = Record<string, ValidationRule>

/**
 * IPC 响应数据结构
 * 继承自 IpcResult，额外添加错误代码字段
 */
export type IpcResponse<T = unknown> = IpcResult<T> & {
  /** 错误代码，用于区分不同的错误类型 */
  code?: string
}

/**
 * IPC 处理器配置
 */
export interface IpcHandlerConfig {
  /** IPC 通道名称 */
  channel: string
  /** 参数验证规则（可选） */
  schema?: ValidationSchema
  /** 是否输出详细日志 */
  verbose?: boolean
  /** 处理函数 */
  handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown> | unknown
}

/**
 * 验证 IPC 参数
 *
 * 验证流程：
 * 1. 检查必填项
 * 2. 检查类型是否匹配
 * 3. 对于字符串：检查长度和正则匹配
 * 4. 对于数字：检查范围
 * 5. 执行自定义校验函数
 *
 * @param args 要验证的参数数组
 * @param schema 验证规则集合
 * @returns string | null 返回错误信息，如果验证通过则返回 null
 */
function validateArgs(args: unknown[], schema: ValidationSchema): string | null {
  const keys = Object.keys(schema)

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    const rule = schema[key]
    const value = args[i]

    // 检查必填项
    if (rule.required && (value === undefined || value === null)) {
      return `参数 ${key} 不能为空`
    }

    // 如果值为空且非必填，跳过后续校验
    if (value === undefined || value === null) {
      continue
    }

    // 类型校验
    if (rule.type === 'array') {
      if (!Array.isArray(value)) {
        return `参数 ${key} 必须是数组`
      }
    }
    else {
      const actualType = typeof value
      const expectedType = rule.type

      const validTypes = ['string', 'number', 'boolean', 'object'] as const
      if (!validTypes.includes(expectedType as typeof validTypes[number])) {
        return `参数 ${key} 类型配置错误`
      }

      if (actualType !== expectedType) {
        return `参数 ${key} 类型错误，期望 ${expectedType}，实际 ${actualType}`
      }
    }

    // 字符串特定校验
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

    // 数字特定校验
    if (rule.type === 'number' && typeof value === 'number') {
      if (rule.min !== undefined && value < rule.min) {
        return `参数 ${key} 不能小于 ${rule.min}`
      }
      if (rule.max !== undefined && value > rule.max) {
        return `参数 ${key} 不能大于 ${rule.max}`
      }
    }

    // 自定义校验
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
 * 格式化错误信息
 * 将各种类型的错误统一转换为字符串
 * @param error 错误对象
 * @returns string 错误信息字符串
 */
function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

/**
 * 创建 IPC 处理器
 *
 * 功能特性：
 * 1. 参数校验：根据 schema 自动验证参数
 * 2. 错误处理：自动捕获异常并返回标准错误响应
 * 3. 性能监控：记录处理时长，超过 1 秒自动输出警告
 * 4. 日志输出：支持详细日志模式
 *
 * @param config IPC 处理器配置
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

      // 详细日志：输出请求参数
      if (verbose) {
        console.log(`${prefix} 开始处理`, args)
      }

      // 执行处理函数
      const result = await handler(event, ...args)

      // 性能监控：记录处理时长
      const duration = Date.now() - startTime
      if (verbose || duration > 1000) {
        console.log(`${prefix} 处理完成 (${duration}ms)`)
      }

      return result
    }
    catch (error) {
      // 错误处理：捕获异常并返回标准错误响应
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
 * 适用于不需要参数校验的简单场景
 *
 * @param channel IPC 通道名称
 * @param handler 处理函数
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
 * 用于一次性注册多个 IPC 通道处理器
 *
 * @param configs IPC 处理器配置数组
 */
export function registerIpcHandlers(configs: IpcHandlerConfig[]): void {
  for (const config of configs) {
    createIpcHandler(config)
  }
}

/**
 * 创建成功响应（带数据）
 * @param data 响应数据
 * @returns IpcResponse<T> 成功响应对象
 */
export function success<T>(data: T): IpcResponse<T>
/**
 * 创建成功响应（无数据）
 * @returns IpcResponse<undefined> 成功响应对象
 */
export function success(): IpcResponse<undefined>
export function success<T>(data?: T): IpcResponse<T | undefined> {
  return {
    success: true,
    data,
  } as IpcResponse<T | undefined>
}

/**
 * 创建失败响应
 * @param error 错误信息
 * @param code 错误代码（可选）
 * @returns IpcResponse 失败响应对象
 */
export function failure(error: string, code?: string): IpcResponse {
  return {
    success: false,
    error,
    code,
  }
}
