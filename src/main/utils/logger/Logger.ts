import type { LoggerConfig, LogRecord, LogTransport } from './types'
import { ConsoleTransport, FileTransport } from './transports'
import { LogLevel } from './types'

export class Logger {
  private module: string
  private explicitMinLevel?: LogLevel
  private static globalTransports: LogTransport[] = []
  private static defaultMinLevel: LogLevel = LogLevel.DEBUG

  constructor(module: string, minLevel?: LogLevel) {
    this.module = module
    this.explicitMinLevel = minLevel
  }

  static initialize(config: LoggerConfig): void {
    Logger.defaultMinLevel = config.minLevel
    Logger.globalTransports = []

    if (config.enableConsole) {
      Logger.globalTransports.push(new ConsoleTransport(config.minLevel))
    }

    if (config.enableFile) {
      if (!config.logDir)
        throw new Error('logDir is required when enableFile is true')
      Logger.globalTransports.push(
        new FileTransport(config.minLevel, {
          logDir: config.logDir,
          maxFileSize: config.maxFileSize,
          maxFiles: config.maxFiles,
        }),
      )
    }
  }

  child(subModule: string): Logger {
    const fullModule = this.module ? `${this.module}:${subModule}` : subModule
    return new Logger(fullModule, this.explicitMinLevel)
  }

  debug(message: string, data?: unknown): void {
    this.log(LogLevel.DEBUG, message, data)
  }

  info(message: string, data?: unknown): void {
    this.log(LogLevel.INFO, message, data)
  }

  warn(message: string, data?: unknown): void {
    this.log(LogLevel.WARN, message, data)
  }

  error(message: string, error?: Error | unknown, data?: unknown): void {
    const errorObj = error instanceof Error ? error : undefined
    const dataObj = error instanceof Error ? data : error
    this.log(LogLevel.ERROR, message, dataObj, errorObj)
  }

  private log(level: LogLevel, message: string, data?: unknown, error?: Error): void {
    const minLevel = this.explicitMinLevel ?? Logger.defaultMinLevel
    if (level < minLevel)
      return

    const record: LogRecord = {
      timestamp: new Date(),
      level,
      module: this.module,
      message,
      data,
      error,
    }

    for (const transport of Logger.globalTransports) {
      if (level < transport.minLevel)
        continue
      try {
        transport.log(record)
      }
      catch (err) {
        console.error(`[Logger] Transport ${transport.name} failed:`, err)
      }
    }
  }

  static async flush(): Promise<void> {
    await Promise.all(
      Logger.globalTransports.map(t => t.flush?.()),
    )
  }

  static async close(): Promise<void> {
    await Promise.all(
      Logger.globalTransports.map(t => t.close?.()),
    )
    Logger.globalTransports = []
  }
}

export function createLogger(module: string, minLevel?: LogLevel): Logger {
  return new Logger(module, minLevel)
}
