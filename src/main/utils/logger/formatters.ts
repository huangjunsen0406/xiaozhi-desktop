import type { LogFormatter, LogRecord } from './types'
import { ColorReset, LogLevelColor, LogLevelName } from './types'

function formatData(data: unknown, pretty = false): string {
  if (typeof data === 'string')
    return data
  try {
    return pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data)
  }
  catch {
    return String(data)
  }
}

export class ConsoleFormatter implements LogFormatter {
  format(record: LogRecord): string {
    const d = record.timestamp
    const pad = (n: number) => String(n).padStart(2, '0')
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`
    const level = LogLevelName[record.level].padEnd(5)
    const color = LogLevelColor[record.level]
    const module = record.module ? `[${record.module}]` : ''

    let result = `${color}${time} ${level}${ColorReset} ${module} ${record.message}`
    if (record.data !== undefined)
      result += `\n${formatData(record.data, true)}`
    if (record.error) {
      result += `\n${record.error.name}: ${record.error.message}`
      if (record.error.stack)
        result += `\n${record.error.stack}`
    }
    return result
  }
}

export class TextFormatter implements LogFormatter {
  format(record: LogRecord): string {
    const time = record.timestamp.toISOString()
    const level = LogLevelName[record.level].padEnd(5)
    const module = record.module ? `[${record.module}]` : ''

    let result = `${time} ${level} ${module} ${record.message}`
    if (record.data !== undefined)
      result += ` | ${formatData(record.data)}`
    if (record.error) {
      result += ` | ERROR: ${record.error.message}`
      if (record.error.stack)
        result += `\n${record.error.stack}`
    }
    return result
  }
}
