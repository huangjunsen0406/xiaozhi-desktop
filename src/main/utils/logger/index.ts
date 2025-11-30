/**
 * 日志系统入口（单例模式 + 懒加载）
 *
 * 使用示例：
 *
 * ```typescript
 * import { getLogger } from './utils/logger'
 *
 * // 获取模块化 logger（推荐）
 * const dbLogger = getLogger('Database')
 * dbLogger.debug('调试信息', { data: 'value' })
 * dbLogger.info('处理完成')
 * ```
 */

import path from 'node:path'
import { app } from 'electron'
import { createLogger, Logger } from './Logger'
import { LogLevel } from './types'

export * from './formatters'
// 不再导出 createLogger，避免外部模块直接调用
export { Logger } from './Logger'
export * from './transports'
// 导出类型
export { LogLevel } from './types'
export type { LoggerConfig, LogRecord, LogTransport } from './types'

/**
 * 全局 logger 单例（根 logger）- 懒加载
 */
let _rootLogger: Logger | null = null

/**
 * 获取模块 logger（推荐使用）
 *
 * @param scope 模块名称
 * @returns 带作用域的 logger 实例
 *
 * @example
 * ```typescript
 * import { getLogger } from '../utils/logger'
 * const logger = getLogger('Database')
 * logger.info('数据库初始化完成')
 * ```
 */
export function getLogger(scope: string): Logger {
  if (!_rootLogger) {
    _rootLogger = createLogger('App')
  }
  return _rootLogger.child(scope)
}

/**
 * 初始化日志系统（依赖注入模式）
 */
export function initLogger(options?: {
  minLevel?: LogLevel
  enableConsole?: boolean
  enableFile?: boolean
  enableIPC?: boolean
}): void {
  // 延迟导入 electron，避免循环依赖
  // const { app } = require('electron')
  const isDev = !app.isPackaged

  const config = {
    minLevel: options?.minLevel ?? (isDev ? LogLevel.DEBUG : LogLevel.INFO),
    enableConsole: options?.enableConsole ?? true,
    enableFile: options?.enableFile ?? true,
    enableIPC: options?.enableIPC ?? false,
    isProduction: !isDev,
    // 注入日志目录路径，而不是在 Transport 内部获取
    logDir: path.join(app.getPath('userData'), 'logs'),
  }

  Logger.initialize(config)

  // 确保 rootLogger 已创建
  if (!_rootLogger) {
    _rootLogger = createLogger('App')
  }

  _rootLogger.info('日志系统已初始化', {
    minLevel: LogLevel[config.minLevel],
    enableConsole: config.enableConsole,
    enableFile: config.enableFile,
    enableIPC: config.enableIPC,
    logDir: config.logDir,
    isDev,
  })
}

/**
 * 应用退出时清理日志系统
 */
export async function shutdownLogger(): Promise<void> {
  if (_rootLogger) {
    _rootLogger.info('日志系统正在关闭...')
  }
  await Logger.flush()
  await Logger.close()
}
