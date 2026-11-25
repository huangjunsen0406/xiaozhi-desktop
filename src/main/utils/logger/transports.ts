/**
 * 日志传输层实现（不依赖 electron）
 */
import type { LogRecord, LogTransport } from './types'
import { Buffer } from 'node:buffer'
import fs from 'node:fs'
import path from 'node:path'
import { ConsoleFormatter, TextFormatter } from './formatters'
import { LogLevel } from './types'

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
  private draining: Promise<void> | null = null

  constructor(
    minLevel: LogLevel = LogLevel.INFO,
    options: {
      logDir: string
      maxFileSize?: number
      maxFiles?: number
    },
  ) {
    this.minLevel = minLevel
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024
    this.maxFiles = options.maxFiles || 7
    this.logDir = options.logDir

    if (!fs.existsSync(this.logDir))
      fs.mkdirSync(this.logDir, { recursive: true })

    this.currentFile = this.getCurrentLogFile()
    this.initWriteStream()
  }

  log(record: LogRecord): void {
    this.writeQueue.push(`${this.formatter.format(record)}\n`)
    if (!this.draining) {
      this.draining = this.processQueue().finally(() => {
        this.draining = null
      })
    }
  }

  private async processQueue(): Promise<void> {
    while (this.writeQueue.length > 0) {
      const line = this.writeQueue.shift()!
      const bytes = Buffer.byteLength(line)
      if (this.currentSize + bytes > this.maxFileSize)
        await this.rotate()

      if (this.writeStream) {
        this.writeStream.write(line)
        this.currentSize += bytes
      }
    }
  }

  private initWriteStream(): void {
    try {
      this.currentSize = fs.existsSync(this.currentFile) ? fs.statSync(this.currentFile).size : 0
      this.writeStream = fs.createWriteStream(this.currentFile, { flags: 'a', encoding: 'utf8' })
      this.writeStream.on('error', error => console.error('Write stream error', error))
    }
    catch (error) {
      console.error('Failed to initialize write stream', error)
    }
  }

  private getCurrentLogFile(): string {
    const date = new Date().toISOString().split('T')[0]
    return path.join(this.logDir, `xiaozhi-${date}.log`)
  }

  private async rotate(): Promise<void> {
    try {
      if (this.writeStream) {
        const stream = this.writeStream
        await new Promise<void>(resolve => stream.end(() => resolve()))
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const rotatedFile = this.currentFile.replace('.log', `-${timestamp}.log`)
      fs.renameSync(this.currentFile, rotatedFile)
      this.cleanOldFiles()

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
        .sort((a, b) => b.mtime - a.mtime)

      for (const file of files.slice(this.maxFiles)) {
        try {
          fs.unlinkSync(file.path)
        }
        catch (error) {
          console.error(`[FileTransport] Failed to delete ${file.name}:`, error)
        }
      }
    }
    catch (error) {
      console.error('Failed to clean old files', error)
    }
  }

  async flush(): Promise<void> {
    while (this.draining)
      await this.draining
  }

  async close(): Promise<void> {
    await this.flush()
    if (this.writeStream) {
      const stream = this.writeStream
      this.writeStream = null
      await new Promise<void>(resolve => stream.end(() => resolve()))
    }
  }
}
