/**
 * 日志系统类型定义
 */

/**
 * 日志级别
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * 日志级别名称映射
 */
export const LogLevelName: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
}

/**
 * 日志颜色（用于 console 输出）
 */
export const LogLevelColor: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: '\x1B[36m', // 青色
  [LogLevel.INFO]: '\x1B[32m', // 绿色
  [LogLevel.WARN]: '\x1B[33m', // 黄色
  [LogLevel.ERROR]: '\x1B[31m', // 红色
}

export const ColorReset = '\x1B[0m'

/**
 * 日志记录
 */
export interface LogRecord {
  timestamp: Date
  level: LogLevel
  module: string
  message: string
  data?: unknown
  error?: Error
}

/**
 * 日志传输接口
 */
export interface LogTransport {
  name: string
  minLevel: LogLevel
  log: (record: LogRecord) => void | Promise<void>
  flush?: () => void | Promise<void>
  close?: () => void | Promise<void>
}

/**
 * 日志配置
 */
export interface LoggerConfig {
  /** 最低日志级别 */
  minLevel: LogLevel
  /** 是否启用控制台输出 */
  enableConsole: boolean
  /** 是否启用文件输出 */
  enableFile: boolean
  /** 日志文件目录 */
  logDir?: string
  /** 单个日志文件最大大小（字节），默认 10MB */
  maxFileSize?: number
  /** 最多保留日志文件数量，默认 7 */
  maxFiles?: number
  /** 是否启用 IPC 输出（发送到渲染进程） */
  enableIPC?: boolean
  /** 是否在生产环境 */
  isProduction?: boolean
}

/**
 * 日志格式化器
 */
export interface LogFormatter {
  format: (record: LogRecord) => string
}
