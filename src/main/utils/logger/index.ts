/**
 * 日志系统入口
 *
 * 使用示例：
 *
 * ```typescript
 * import { logger, createLogger } from './utils/logger'
 *
 * // 使用默认 logger
 * logger.info('应用启动')
 * logger.error('发生错误', error)
 *
 * // 创建模块化 logger
 * const mcpLogger = createLogger('MCP')
 * mcpLogger.debug('调试信息', { data: 'value' })
 * mcpLogger.info('处理完成')
 *
 * // 创建子 logger
 * const toolLogger = mcpLogger.child('Tools')
 * toolLogger.warn('工具调用超时')
 * ```
 */

import { app } from 'electron'
import { createLogger, Logger } from './Logger'
import { LogLevel } from './types'

export * from './formatters'
export { createLogger, Logger } from './Logger'
export * from './transports'
// 导出类型
export { LogLevel } from './types'
export type { LoggerConfig, LogRecord, LogTransport } from './types'

/**
 * 全局默认 logger
 */
export const logger = createLogger('App')

/**
 * 初始化日志系统
 */
export function initLogger(options?: {
  minLevel?: LogLevel
  enableConsole?: boolean
  enableFile?: boolean
  enableIPC?: boolean
}): void {
  const isDev = !app.isPackaged

  const config = {
    minLevel: options?.minLevel ?? (isDev ? LogLevel.DEBUG : LogLevel.INFO),
    enableConsole: options?.enableConsole ?? true,
    enableFile: options?.enableFile ?? true,
    enableIPC: options?.enableIPC ?? false,
    isProduction: !isDev,
  }

  Logger.initialize(config)

  logger.info('日志系统已初始化', {
    minLevel: LogLevel[config.minLevel],
    enableConsole: config.enableConsole,
    enableFile: config.enableFile,
    enableIPC: config.enableIPC,
    isDev,
  })
}

/**
 * 应用退出时清理日志系统
 */
export async function shutdownLogger(): Promise<void> {
  logger.info('日志系统正在关闭...')
  await Logger.flush()
  await Logger.close()
}
