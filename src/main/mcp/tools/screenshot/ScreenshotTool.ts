/**
 * 截图工具 - 支持截取桌面屏幕并分析
 * 使用 node-screenshots 实现跨平台统一截图
 */

import { Buffer } from 'node:buffer'
import { Monitor } from 'node-screenshots'
import { getLogger } from '../../../utils/logger'
import { getSharp } from '../../../utils/sharp'

const logger = getLogger('ScreenshotTool')

/**
 * 截图压缩参数
 */
const COMPRESS_MAX_DIMENSION = 1920
const COMPRESS_JPEG_QUALITY = 80

export interface ScreenshotOptions {
  /**
   * 显示器ID
   * - undefined/null: 所有显示器
   * - 'main': 主显示器
   * - 'secondary': 副显示器
   * - number: 指定显示器索引（从1开始）
   */
  display?: string | number | null
  /**
   * JPEG 质量 (1-100)
   */
  quality?: number
}

export interface ScreenshotResult {
  success: boolean
  data?: Buffer
  base64?: string
  width?: number
  height?: number
  /**
   * 图片实际编码格式（用于上游 vision API 选择正确 MIME / 文件名）
   * 默认 image/jpeg（压缩成功后）
   * 压缩失败回退时为 image/png
   */
  mime?: 'image/jpeg' | 'image/png'
  message?: string
}

/**
 * 截图工具类（由 McpServer / McpToolRuntime 持有，禁止懒 getInstance）
 */
export class ScreenshotTool {
  private constructor() {}

  /**
   * 显式创建实例
   */
  public static create(): ScreenshotTool {
    return new ScreenshotTool()
  }

  /**
   * 截取桌面屏幕（跨平台统一实现）
   */
  public async capture(options: ScreenshotOptions = {}): Promise<ScreenshotResult> {
    try {
      const { display = null } = options

      // 获取所有显示器
      const monitors = Monitor.all()

      if (monitors.length === 0) {
        return {
          success: false,
          message: 'No monitors found',
        }
      }

      // 解析显示器参数
      const targetMonitor = this.parseMonitor(display, monitors)

      if (!targetMonitor) {
        return {
          success: false,
          message: `Invalid display parameter: ${display}`,
        }
      }

      logger.info(`Capturing monitor ${targetMonitor.id}, size: ${targetMonitor.width}x${targetMonitor.height}`)

      // 截图（Electron 环境需要传 true 避免崩溃）
      const image = await targetMonitor.captureImage()

      // 转换为 PNG（Electron 环境传 true）
      const pngBuffer = await image.toPng(true)
      const originalBytes = pngBuffer.length

      // 尝试用 sharp 压缩为 JPEG（最长边 1920，quality=80）
      // 失败时回退原始 PNG，保证截图功能不至于完全不能用
      let finalBuffer: Buffer
      let mime: 'image/jpeg' | 'image/png'
      try {
        const sharp = await getSharp()
        const jpegBuffer = await sharp(pngBuffer)
          .resize({
            width: COMPRESS_MAX_DIMENSION,
            height: COMPRESS_MAX_DIMENSION,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({ quality: COMPRESS_JPEG_QUALITY })
          .toBuffer()
        finalBuffer = Buffer.from(jpegBuffer)
        mime = 'image/jpeg'
        const ratio = originalBytes > 0
          ? `${((finalBuffer.length / originalBytes) * 100).toFixed(1)}%`
          : 'n/a'
        logger.debug('截图压缩', {
          originalBytes,
          compressedBytes: finalBuffer.length,
          ratio,
          mime,
        })
      }
      catch (error) {
        logger.warn('sharp 压缩失败，回退原始 PNG', error)
        finalBuffer = Buffer.from(pngBuffer)
        mime = 'image/png'
      }

      const base64 = finalBuffer.toString('base64')

      logger.info(
        `Screenshot captured: ${targetMonitor.width}x${targetMonitor.height}, `
        + `${finalBuffer.length} bytes, mime=${mime}`,
      )

      return {
        success: true,
        data: finalBuffer,
        base64,
        width: targetMonitor.width,
        height: targetMonitor.height,
        mime,
      }
    }
    catch (error) {
      logger.error('Capture failed', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * 解析显示器参数，返回对应的 Monitor 实例
   */
  private parseMonitor(
    display: string | number | null | undefined,
    monitors: Monitor[],
  ): Monitor | null {
    if (monitors.length === 0) {
      return null
    }

    // 默认返回第一个显示器（通常是主显示器）
    if (display === null || display === undefined) {
      return monitors[0]
    }

    // 数字索引（从1开始）
    if (typeof display === 'number') {
      if (display > 0 && display <= monitors.length) {
        const targetMonitor = monitors[display - 1]
        logger.info(`Display index ${display} -> Monitor ID ${targetMonitor.id}`)
        return targetMonitor
      }
      logger.warn(`Invalid display index: ${display}`)
      return monitors[0]
    }

    // 字符串参数
    if (typeof display === 'string') {
      const normalized = display.toLowerCase().trim()

      // 主显示器
      if (['main', '主屏', '主显示器', '笔记本', '内屏'].includes(normalized)) {
        logger.info('Using primary display')
        return monitors[0]
      }

      // 副显示器
      if (['secondary', '副屏', '副显示器', '外接', '外屏', '第二屏'].includes(normalized)) {
        if (monitors.length > 1) {
          logger.info('Using secondary display')
          return monitors[1]
        }
        logger.warn('No secondary display found, using primary')
        return monitors[0]
      }

      // 尝试解析为数字索引
      const num = Number.parseInt(display, 10)
      if (!Number.isNaN(num) && num > 0 && num <= monitors.length) {
        const targetMonitor = monitors[num - 1]
        logger.info(`Display index ${num} -> Monitor ID ${targetMonitor.id}`)
        return targetMonitor
      }
    }

    logger.warn(`Unknown display parameter: ${display}, using primary`)
    return monitors[0]
  }

  /**
   * 获取所有显示器信息
   */
  public getDisplaysInfo(): Array<{
    id: number
    index: number
    width: number
    height: number
    x: number
    y: number
    isPrimary: boolean
  }> {
    const monitors = Monitor.all()
    return monitors.map((monitor, index) => ({
      id: monitor.id,
      index: index + 1,
      width: monitor.width,
      height: monitor.height,
      x: monitor.x,
      y: monitor.y,
      isPrimary: index === 0, // 第一个通常是主显示器
    }))
  }
}
