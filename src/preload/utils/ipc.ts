import type { IpcResult } from '@shared/types'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isIpcResultLike(value: unknown): value is IpcResult<unknown> {
  if (!isObject(value) || typeof value.success !== 'boolean') {
    return false
  }
  return value.success ? 'data' in value : typeof value.error === 'string'
}

/**
 * 将 invoke 返回值（unknown）收窄为业务数据。
 * 只接受标准 `IpcResult<T>`，拒绝裸返回值。
 */
export function unwrapIpcResult<T>(result: unknown, fallbackError = '请求失败'): T {
  if (!isIpcResultLike(result)) {
    throw new Error(`${fallbackError}: IPC 响应格式无效`)
  }
  if (!result.success) {
    throw new Error(result.error || fallbackError)
  }
  return result.data as T
}

/**
 * 断言仅含 `{ success, error? }` 的 invoke 结果成功。
 * 入参为 unknown，禁止调用方再写 `as { success... }`。
 */
export function assertIpcSuccess(result: unknown, fallbackError = '请求失败'): void {
  if (!isIpcResultLike(result)) {
    throw new Error(`${fallbackError}: IPC 响应格式无效`)
  }
  if (!result.success) {
    throw new Error(result.error || fallbackError)
  }
}
