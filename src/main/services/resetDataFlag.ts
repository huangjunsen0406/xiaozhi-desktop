/**
 * --reset-data 参数解析（纯函数，不依赖 Electron）
 *
 * Chromium / Electron 会把 `--foo-bar` 规范成 `foo-bar`。
 * 打包后用户也可能写成 `--reset-data=1`。
 */

import process from 'node:process'

export const RESET_DATA_FLAG = '--reset-data'

export function isResetDataArg(arg: string): boolean {
  const value = arg.startsWith('--') ? arg.slice(2) : arg
  return value === 'reset-data' || value.startsWith('reset-data=')
}

export function hasResetDataFlag(argv: readonly string[] = process.argv): boolean {
  return argv.some(isResetDataArg)
}

export function stripResetDataArgs(argv: readonly string[]): string[] {
  return argv.filter(arg => !isResetDataArg(arg))
}
