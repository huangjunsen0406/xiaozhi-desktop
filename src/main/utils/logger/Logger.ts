/**
 * 日志系统核心类
 */
import type { LoggerConfig, LogRecord, LogTransport } from './types'
import { ConsoleTransport, FileTransport, IPCTransport } from './transports'
import { LogLevel } from './types'

/**
 * Logger 类
 */
export class Logger {
  private module: string
  private minLevel: LogLevel
  private transports: LogTransport[] = []
  private static globalTransports: LogTransport[] = []
  private static defaultMinLevel: LogLevel = LogLevel.DEBUG

  constructor(module: string, minLevel?: LogLevel) {
    this.module = module
    this.minLevel = minLevel !== undefined ? minLevel : Logger.defaultMinLevel
  }

  /**
   * 初始化全局日志系统
   */
  static initialize(config: LoggerConfig): void {
    Logger.defaultMinLevel = config.minLevel
    Logger.globalTransports = []

    // 添加控制台传输
    if (config.enableConsole) {
      Logger.globalTransports.push(new ConsoleTransport(config.minLevel))
    }

    // 添加文件传输
    if (config.enableFile) {
      Logger.globalTransports.push(
        new FileTransport(config.minLevel, {
          logDir: config.logDir,
          maxFileSize: config.maxFileSize,
          maxFiles: config.maxFiles,
        }),
      )
    }

    // 添加 IPC 传输
    if (config.enableIPC) {
      Logger.globalTransports.push(new IPCTransport(LogLevel.WARN))
    }

    // Logger initialization - uses console directly to avoid circular dependency
    // console.log('[Logger] Initialized with transports:', Logger.globalTransports.map(t => t.name))
  }

  /**
   * 创建子日志记录器
   */
  child(subModule: string): Logger {
    const fullModule = this.module ? `${this.module}:${subModule}` : subModule
    return new Logger(fullModule, this.minLevel)
  }

  /**
   * 调试日志
   */
  debug(message: string, data?: unknown): void {
    this.log(LogLevel.DEBUG, message, data)
  }

  /**
   * 信息日志
   */
  info(message: string, data?: unknown): void {
    this.log(LogLevel.INFO, message, data)
  }

  /**
   * 警告日志
   */
  warn(message: string, data?: unknown): void {
    this.log(LogLevel.WARN, message, data)
  }

  /**
   * 错误日志
   */
  error(message: string, error?: Error | unknown, data?: unknown): void {
    const errorObj = error instanceof Error ? error : undefined
    const dataObj = error instanceof Error ? data : error
    this.log(LogLevel.ERROR, message, dataObj, errorObj)
  }

  /**
   * 核心日志方法
   */
  private log(level: LogLevel, message: string, data?: unknown, error?: Error): void {
    // 检查日志级别
    if (level < this.minLevel) {
      return
    }

    // 创建日志记录
    const record: LogRecord = {
      timestamp: new Date(),
      level,
      module: this.module,
      message,
      data,
      error,
    }

    // 发送到所有传输
    const allTransports = [...this.transports, ...Logger.globalTransports]
    allTransports.forEach((transport) => {
      if (level >= transport.minLevel) {
        try {
          transport.log(record)
        }
        catch (error) {
          // 传输失败不应影响其他传输
          console.error(`[Logger] Transport ${transport.name} failed:`, error)
        }
      }
    })
  }

  /**
   * 添加自定义传输
   */
  addTransport(transport: LogTransport): void {
    this.transports.push(transport)
  }

  /**
   * 移除传输
   */
  removeTransport(name: string): void {
    this.transports = this.transports.filter(t => t.name !== name)
  }

  /**
   * 刷新所有传输
   */
  static async flush(): Promise<void> {
    await Promise.all(
      Logger.globalTransports.map(async (transport) => {
        if (transport.flush) {
          await transport.flush()
        }
      }),
    )
  }

  /**
   * 关闭所有传输
   */
  static async close(): Promise<void> {
    await Promise.all(
      Logger.globalTransports.map(async (transport) => {
        if (transport.close) {
          await transport.close()
        }
      }),
    )
    Logger.globalTransports = []
  }
}

/**
 * 创建日志记录器的便捷函数
 */
export function createLogger(module: string, minLevel?: LogLevel): Logger {
  return new Logger(module, minLevel)
}
