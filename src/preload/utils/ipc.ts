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

export function unwrapIpcResult<T>(result: IpcResult<T> | IpcResultLike<T> | T, fallbackError = '请求失败'): T {
  if (isIpcResultLike<T>(result)) {
    if (!result.success) {
      throw new Error(result.error || fallbackError)
    }
    return (result as { data?: T }).data as T
  }
  return result as T
}

export function assertIpcSuccess(result: { success: boolean, error?: string }, fallbackError = '请求失败'): void {
  if (!result.success) {
    throw new Error(result.error || fallbackError)
  }
}
