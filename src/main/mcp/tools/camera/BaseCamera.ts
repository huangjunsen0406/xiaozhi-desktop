import type { AnalyzeResult, CameraToolConfig, CaptureResult } from './types'
import { Buffer } from 'node:buffer'
import { BrowserWindow, ipcMain } from 'electron'
import { getLogger } from '../../../utils/logger'
import { getSharp } from '../../../utils/sharp'

const logger = getLogger('BaseCamera')

export abstract class BaseCamera {
  protected jpegBuffer: Buffer | null = null
  protected config: CameraToolConfig

  protected constructor(config?: Partial<CameraToolConfig>) {
    this.config = {
      cameraIndex: config?.cameraIndex ?? 0,
      frameWidth: config?.frameWidth ?? 640,
      frameHeight: config?.frameHeight ?? 480,
      maxDimension: config?.maxDimension ?? 320,
      jpegQuality: config?.jpegQuality ?? 80,
    }
  }

  async capture(): Promise<CaptureResult> {
    try {
      logger.info('开始捕获图像...')

      const win = this.findAvailableWindow()
      if (!win) {
        logger.error('未找到可用窗口')
        return { success: false, message: '未找到可用窗口' }
      }

      win.webContents.send('camera:request-capture')

      const imageData = await this.waitForCaptureResult()

      const sharp = await getSharp()
      const resizedBuffer = await sharp(imageData)
        .resize(this.config.maxDimension, this.config.maxDimension, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: this.config.jpegQuality })
        .toBuffer()

      this.jpegBuffer = resizedBuffer
      logger.info(`图像捕获成功 (大小: ${resizedBuffer.length} 字节)`)

      return { success: true, data: resizedBuffer }
    }
    catch (error) {
      logger.error('捕获图像失败', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : '捕获图像失败',
      }
    }
  }

  abstract analyze(question: string): Promise<AnalyzeResult>

  getJpegBuffer(): Buffer | null {
    return this.jpegBuffer
  }

  setJpegBuffer(buffer: Buffer): void {
    this.jpegBuffer = buffer
  }

  getConfig(): CameraToolConfig {
    return { ...this.config }
  }

  private findAvailableWindow(): BrowserWindow | null {
    const focused = BrowserWindow.getFocusedWindow()
    if (focused && !focused.isDestroyed()) {
      return focused
    }
    const allWindows = BrowserWindow.getAllWindows()
    for (const win of allWindows) {
      if (!win.isDestroyed() && win.isVisible()) {
        return win
      }
    }
    return allWindows.find(w => !w.isDestroyed()) ?? null
  }

  private waitForCaptureResult(): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>

      const handler = (_event: Electron.IpcMainEvent, data: { success: boolean, data?: Uint8Array, message?: string }) => {
        clearTimeout(timer)
        if (data.success && data.data) {
          resolve(Buffer.from(data.data))
        }
        else {
          reject(new Error(data.message || '捕获失败'))
        }
      }

      timer = setTimeout(() => {
        ipcMain.removeListener('camera:capture-result', handler)
        reject(new Error('捕获图像超时'))
      }, 10000)

      ipcMain.once('camera:capture-result', handler)
    })
  }
}
