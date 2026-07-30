import type { IpcResult } from '@shared/types'

type IpcResultLike<T>
  = | { success: true, data?: T }
    | { success: false, error?: string }

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isIpcResultLike<T = unknown>(value: unknown): value is IpcResultLike<T> {
  return isObject(value) && typeof value.success === 'boolean'
}

/**
 * 将 invoke 返回值（unknown）收窄为业务数据。
 * 支持标准 `IpcResult<T>` 与存量裸 T（逐步淘汰）。
 */
export function unwrapIpcResult<T>(result: unknown, fallbackError = '请求失败'): T {
  if (isIpcResultLike<T>(result)) {
    if (!result.success) {
      throw new Error(result.error || fallbackError)
    }
    return (result as { data?: T }).data as T
  }
  return result as T
}

/**
 * 断言仅含 `{ success, error? }` 的 invoke 结果成功。
 * 入参为 unknown，禁止调用方再写 `as { success... }`。
 */
export function assertIpcSuccess(result: unknown, fallbackError = '请求失败'): void {
  if (!isIpcResultLike(result)) {
    throw new Error(fallbackError)
  }
  if (!result.success) {
    throw new Error(result.error || fallbackError)
  }
}

/**
 * 解析「成功标志 + 顶层附加字段」形态（非标准 data 包装）。
 * 存量迁移中：优先改 main 为 `success({ field })` + preload `unwrapIpcResult`；
 * 本 helper 仅保留给尚未迁完的通道。
 */
export function unwrapIpcSuccessFields<T extends object>(
  result: unknown,
  fallbackError = '请求失败',
): T {
  if (!isObject(result) || typeof result.success !== 'boolean') {
    throw new Error(fallbackError)
  }
  if (result.success !== true) {
    const error = typeof result.error === 'string' && result.error
      ? result.error
      : fallbackError
    throw new Error(error)
  }
  return result as T
}

/** @deprecated 保留 IpcResult 类型 re-export 兼容；新代码直接用 unknown + unwrap */
export type { IpcResult }
