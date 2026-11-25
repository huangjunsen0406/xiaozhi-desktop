import type { IpcResult } from '@shared/types'
import { ipcRenderer } from 'electron'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isIpcResultLike(value: unknown): value is IpcResult<unknown> {
  if (!isObject(value) || typeof value.success !== 'boolean') {
    return false
  }
  return value.success ? 'data' in value : typeof value.error === 'string'
}

export function unwrapIpcResult<T>(result: unknown, fallbackError = '请求失败'): T {
  if (!isIpcResultLike(result)) {
    throw new Error(`${fallbackError}: IPC 响应格式无效`)
  }
  if (!result.success) {
    throw new Error(result.error || fallbackError)
  }
  return result.data as T
}

export function assertIpcSuccess(result: unknown, fallbackError = '请求失败'): void {
  if (!isIpcResultLike(result)) {
    throw new Error(`${fallbackError}: IPC 响应格式无效`)
  }
  if (!result.success) {
    throw new Error(result.error || fallbackError)
  }
}

export async function invokeData<T>(channel: string, fallbackError: string, ...args: unknown[]): Promise<T> {
  const result: unknown = await ipcRenderer.invoke(channel, ...args)
  return unwrapIpcResult<T>(result, fallbackError)
}

export async function invokeVoid(channel: string, fallbackError: string, ...args: unknown[]): Promise<void> {
  const result: unknown = await ipcRenderer.invoke(channel, ...args)
  assertIpcSuccess(result, fallbackError)
}

export function subscribeChannel<Args extends unknown[]>(
  channel: string,
  callback: (...args: Args) => void,
): () => void {
  const listener = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void => {
    callback(...(args as Args))
  }
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.off(channel, listener)
}
