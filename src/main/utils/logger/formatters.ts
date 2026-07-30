/**
 * 日志格式化器
 */
import type { LogFormatter, LogRecord } from './types'
import { ColorReset, LogLevelColor, LogLevelName } from './types'

/**
 * 控制台日志格式化器（带颜色）
 */
export class ConsoleFormatter implements LogFormatter {
  format(record: LogRecord): string {
    const time = this.formatTime(record.timestamp)
    const level = LogLevelName[record.level]
    const color = LogLevelColor[record.level]
    const module = record.module ? `[${record.module}]` : ''

    let result = `${color}${time} ${level.padEnd(5)}${ColorReset} ${module} ${record.message}`

    if (record.data !== undefined) {
      result += `\n${this.formatData(record.data)}`
    }

    if (record.error) {
      result += `\n${this.formatError(record.error)}`
    }

    return result
  }

  private formatTime(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0')
    const hours = pad(date.getHours())
    const minutes = pad(date.getMinutes())
    const seconds = pad(date.getSeconds())
    const ms = String(date.getMilliseconds()).padStart(3, '0')
    return `${hours}:${minutes}:${seconds}.${ms}`
  }

  private formatData(data: unknown): string {
    if (typeof data === 'string') {
      return data
    }
    try {
      return JSON.stringify(data, null, 2)
    }
    catch {
      return String(data)
    }
  }

  private formatError(error: Error): string {
    let result = `${error.name}: ${error.message}`
    if (error.stack) {
      result += `\n${error.stack}`
    }
    return result
  }
}

/**
 * 文件日志格式化器（JSON 格式）
 */
export class FileFormatter implements LogFormatter {
  format(record: LogRecord): string {
    const logObj: Record<string, unknown> = {
      timestamp: record.timestamp.toISOString(),
      level: LogLevelName[record.level],
      module: record.module,
      message: record.message,
    }

    if (record.data !== undefined) {
      logObj.data = this.safeStringify(record.data)
    }

    if (record.error) {
      logObj.error = {
        name: record.error.name,
        message: record.error.message,
        stack: record.error.stack,
      }
    }

    return JSON.stringify(logObj)
  }

  /** 日志边界：序列化失败则降为 string，返回 JSON 友好值 */
  private safeStringify(obj: unknown): unknown {
    try {
      if (typeof obj === 'string') {
        return obj
      }
      return JSON.parse(JSON.stringify(obj)) as unknown
    }
    catch {
      return String(obj)
    }
  }
}

/**
 * 简洁文本格式化器（用于文件）
 */
export class TextFormatter implements LogFormatter {
  format(record: LogRecord): string {
    const time = record.timestamp.toISOString()
    const level = LogLevelName[record.level].padEnd(5)
    const module = record.module ? `[${record.module}]` : ''

    let result = `${time} ${level} ${module} ${record.message}`

    if (record.data !== undefined) {
      result += ` | ${this.formatData(record.data)}`
    }

    if (record.error) {
      result += ` | ERROR: ${record.error.message}`
      if (record.error.stack) {
        result += `\n${record.error.stack}`
      }
    }

    return result
  }

  private formatData(data: unknown): string {
    if (typeof data === 'string') {
      return data
    }
    try {
      return JSON.stringify(data)
    }
    catch {
      return String(data)
    }
  }
}
