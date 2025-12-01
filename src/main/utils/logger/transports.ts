/**
 * 日志传输层实现（依赖注入模式，不直接依赖 electron）
 */
import type { LogRecord, LogTransport } from './types'
import { Buffer } from 'node:buffer'
import fs from 'node:fs'
import path from 'node:path'
import { BrowserWindow } from 'electron'
import { ConsoleFormatter, TextFormatter } from './formatters'
import { LogLevel } from './types'
/**
 * 控制台传输
 */
export class ConsoleTransport implements LogTransport {
  name = 'console'
  minLevel: LogLevel
  private formatter = new ConsoleFormatter()

  constructor(minLevel: LogLevel = LogLevel.DEBUG) {
    this.minLevel = minLevel
  }

  log(record: LogRecord): void {
    const formatted = this.formatter.format(record)

    switch (record.level) {
      case LogLevel.DEBUG:
        console.debug(formatted)
        break
      case LogLevel.INFO:
        console.log(formatted)
        break
      case LogLevel.WARN:
        console.warn(formatted)
        break
      case LogLevel.ERROR:
        console.error(formatted)
        break
    }
  }
}

/**
 * 文件传输（支持日志轮转）- 依赖注入模式
 */
export class FileTransport implements LogTransport {
  name = 'file'
  minLevel: LogLevel
  private formatter = new TextFormatter()
  private logDir: string
  private currentFile: string
  private writeStream: fs.WriteStream | null = null
  private currentSize = 0
  private maxFileSize: number
  private maxFiles: number
  private writeQueue: string[] = []
  private isWriting = false

  constructor(
    minLevel: LogLevel = LogLevel.INFO,
    options: {
      logDir: string // 必须从外部注入，不再可选
      maxFileSize?: number
      maxFiles?: number
    },
  ) {
    this.minLevel = minLevel
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024 // 10MB
    this.maxFiles = options.maxFiles || 7

    // 使用注入的日志目录，不再访问 electron app
    this.logDir = options.logDir

    // 确保目录存在
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true })
    }

    // 初始化当前日志文件
    this.currentFile = this.getCurrentLogFile()
    this.initWriteStream()
  }

  log(record: LogRecord): void {
    const formatted = this.formatter.format(record)
    const line = `${formatted}\n`

    // 添加到写入队列
    this.writeQueue.push(line)

    // 触发异步写入
    this.processQueue()
  }

  private async processQueue(): Promise<void> {
    if (this.isWriting || this.writeQueue.length === 0) {
      return
    }

    this.isWriting = true

    while (this.writeQueue.length > 0) {
      const line = this.writeQueue.shift()!

      // 检查是否需要轮转
      if (this.currentSize + Buffer.byteLength(line) > this.maxFileSize) {
        await this.rotate()
      }

      // 写入文件
      if (this.writeStream) {
        this.writeStream.write(line)
        this.currentSize += Buffer.byteLength(line)
      }
    }

    this.isWriting = false
  }

  private initWriteStream(): void {
    try {
      // 获取当前文件大小
      if (fs.existsSync(this.currentFile)) {
        const stats = fs.statSync(this.currentFile)
        this.currentSize = stats.size
      }
      else {
        this.currentSize = 0
      }

      // 创建写入流（追加模式）
      this.writeStream = fs.createWriteStream(this.currentFile, {
        flags: 'a',
        encoding: 'utf8',
      })

      this.writeStream.on('error', (error) => {
        console.error('Write stream error', error)
      })
    }
    catch (error) {
      console.error('Failed to initialize write stream', error)
    }
  }

  private getCurrentLogFile(): string {
    const date = new Date().toISOString().split('T')[0] // YYYY-MM-DD
    return path.join(this.logDir, `xiaozhi-${date}.log`)
  }

  private async rotate(): Promise<void> {
    try {
      // 关闭当前流
      if (this.writeStream) {
        await new Promise<void>((resolve) => {
          this.writeStream!.end(() => resolve())
        })
      }

      // 重命名当前文件（添加时间戳）
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const rotatedFile = this.currentFile.replace('.log', `-${timestamp}.log`)
      fs.renameSync(this.currentFile, rotatedFile)

      // 清理旧文件
      this.cleanOldFiles()

      // 创建新文件
      this.currentFile = this.getCurrentLogFile()
      this.currentSize = 0
      this.initWriteStream()
    }
    catch (error) {
      console.error('Failed to rotate log file', error)
    }
  }

  private cleanOldFiles(): void {
    try {
      const files = fs
        .readdirSync(this.logDir)
        .filter(f => f.startsWith('xiaozhi-') && f.endsWith('.log'))
        .map(f => ({
          name: f,
          path: path.join(this.logDir, f),
          mtime: fs.statSync(path.join(this.logDir, f)).mtime.getTime(),
        }))
        .sort((a, b) => b.mtime - a.mtime) // 按修改时间降序

      // 删除超过最大数量的文件
      if (files.length > this.maxFiles) {
        files.slice(this.maxFiles).forEach((file) => {
          try {
            fs.unlinkSync(file.path)
            console.log(`[FileTransport] Deleted old log file: ${file.name}`)
          }
          catch (error) {
            console.error(`[FileTransport] Failed to delete ${file.name}:`, error)
          }
        })
      }
    }
    catch (error) {
      console.error('Failed to clean old files', error)
    }
  }

  async flush(): Promise<void> {
    // 等待队列处理完成
    while (this.writeQueue.length > 0 || this.isWriting) {
      await new Promise(resolve => setTimeout(resolve, 10))
    }
  }

  async close(): Promise<void> {
    await this.flush()

    if (this.writeStream) {
      await new Promise<void>((resolve) => {
        this.writeStream!.end(() => resolve())
      })
      this.writeStream = null
    }
  }
}

/**
 * IPC 传输（发送到渲染进程，用于 UI 显示）
 */
export class IPCTransport implements LogTransport {
  name = 'ipc'
  minLevel: LogLevel
  private formatter = new TextFormatter()

  constructor(minLevel: LogLevel = LogLevel.INFO) {
    this.minLevel = minLevel
  }

  log(record: LogRecord): void {
    try {
      // const { BrowserWindow } = require('electron')
      const windows = BrowserWindow.getAllWindows()

      // 发送到所有窗口
      windows.forEach((win) => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('logger:log', {
            timestamp: record.timestamp.toISOString(),
            level: record.level,
            module: record.module,
            message: this.formatter.format(record),
          })
        }
      })
    }
    catch (error) {
      // IPC 传输失败不应影响日志系统
      // 静默失败
      console.error('Failed to send log via IPC', error)
    }
  }
}
