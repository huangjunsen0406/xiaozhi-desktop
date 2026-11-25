import type { CameraToolConfig, CaptureResult } from './types'
import { Buffer } from 'node:buffer'
import { BrowserWindow, ipcMain } from 'electron'
import { getLogger } from '../../../utils/logger'
import { getSharp } from '../../../utils/sharp'

const logger = getLogger('Camera')

function findAvailableWindow(): BrowserWindow | null {
  const focused = BrowserWindow.getFocusedWindow()
  if (focused && !focused.isDestroyed())
    return focused

  const allWindows = BrowserWindow.getAllWindows()
  return allWindows.find(w => !w.isDestroyed() && w.isVisible())
    ?? allWindows.find(w => !w.isDestroyed())
    ?? null
}

function waitForCaptureResult(): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>
    const handler = (_event: Electron.IpcMainEvent, data: { success: boolean, data?: Uint8Array, message?: string }) => {
      clearTimeout(timer)
      if (data.success && data.data)
        resolve(Buffer.from(data.data))
      else
        reject(new Error(data.message || '捕获失败'))
    }

    timer = setTimeout(() => {
      ipcMain.removeListener('camera:capture-result', handler)
      reject(new Error('捕获图像超时'))
    }, 10000)

    ipcMain.once('camera:capture-result', handler)
  })
}

export async function captureCameraImage(config?: Partial<CameraToolConfig>): Promise<CaptureResult> {
  const maxDimension = config?.maxDimension ?? 320
  const jpegQuality = config?.jpegQuality ?? 80

  try {
    logger.info('开始捕获图像...')
    const win = findAvailableWindow()
    if (!win) {
      logger.error('未找到可用窗口')
      return { success: false, message: '未找到可用窗口' }
    }

    win.webContents.send('camera:request-capture')
    const imageData = await waitForCaptureResult()

    const sharp = await getSharp()
    const resizedBuffer = await sharp(imageData)
      .resize(maxDimension, maxDimension, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: jpegQuality })
      .toBuffer()

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

export type { CameraToolConfig, CaptureResult } from './types'
