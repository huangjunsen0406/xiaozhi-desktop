/**
 * 截图工具 - 支持截取桌面屏幕并分析
 */

import { Buffer } from 'node:buffer'
import { exec } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { screen } from 'electron'

const execAsync = promisify(exec)

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
  message?: string
}

/**
 * 截图工具类
 */
export class ScreenshotTool {
  private static instance: ScreenshotTool | null = null

  private constructor() {}

  /**
   * 获取单例实例
   */
  public static getInstance(): ScreenshotTool {
    if (!ScreenshotTool.instance) {
      ScreenshotTool.instance = new ScreenshotTool()
    }
    return ScreenshotTool.instance
  }

  /**
   * 截取桌面屏幕
   */
  public async capture(options: ScreenshotOptions = {}): Promise<ScreenshotResult> {
    try {
      const platform = os.platform()

      if (platform === 'darwin') {
        return await this.captureMacOS(options)
      }
      else if (platform === 'win32') {
        return await this.captureWindows(options)
      }
      else if (platform === 'linux') {
        return await this.captureLinux(options)
      }
      else {
        return {
          success: false,
          message: `Unsupported platform: ${platform}`,
        }
      }
    }
    catch (error) {
      console.error('[ScreenshotTool] Capture failed:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * macOS 截图实现
   */
  private async captureMacOS(options: ScreenshotOptions): Promise<ScreenshotResult> {
    const { display = null } = options
    let tempFile: string | null = null

    try {
      // 创建临时文件
      tempFile = path.join(os.tmpdir(), `screenshot-${Date.now()}.png`)

      // 解析显示器参数
      const displayId = this.parseDisplayId(display)

      let command: string

      if (displayId === null) {
        // 截取所有显示器
        command = `screencapture -x -t png "${tempFile}"`
      }
      else {
        // 截取指定显示器
        command = `screencapture -D ${displayId} -x -t png "${tempFile}"`
      }

      console.log('[ScreenshotTool] Executing command:', command)

      // 执行截图命令
      await execAsync(command)

      // 检查文件是否存在
      if (!fs.existsSync(tempFile)) {
        return {
          success: false,
          message: 'Screenshot file not created',
        }
      }

      // 读取截图数据
      const data = fs.readFileSync(tempFile)

      // 转换为 base64
      const base64 = data.toString('base64')

      // 获取图片尺寸（简单解析PNG头）
      const dimensions = this.getPNGDimensions(data)

      console.log(
        `[ScreenshotTool] Screenshot captured: ${dimensions.width}x${dimensions.height}, ${data.length} bytes`,
      )

      return {
        success: true,
        data,
        base64,
        width: dimensions.width,
        height: dimensions.height,
      }
    }
    catch (error) {
      console.error('[ScreenshotTool] macOS capture failed:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : 'macOS capture failed',
      }
    }
    finally {
      // 清理临时文件
      if (tempFile && fs.existsSync(tempFile)) {
        try {
          fs.unlinkSync(tempFile)
        }
        catch (err) {
          console.error('[ScreenshotTool] Failed to cleanup temp file:', err)
        }
      }
    }
  }

  /**
   * Windows 截图实现
   */
  private async captureWindows(_options: ScreenshotOptions): Promise<ScreenshotResult> {
    // TODO: 实现 Windows 截图
    return {
      success: false,
      message: 'Windows screenshot not implemented yet',
    }
  }

  /**
   * Linux 截图实现
   */
  private async captureLinux(_options: ScreenshotOptions): Promise<ScreenshotResult> {
    // TODO: 实现 Linux 截图
    return {
      success: false,
      message: 'Linux screenshot not implemented yet',
    }
  }

  /**
   * 解析显示器 ID
   */
  private parseDisplayId(display: string | number | null | undefined): number | null {
    if (display === null || display === undefined) {
      return null // 所有显示器
    }

    const displays = screen.getAllDisplays()

    if (typeof display === 'number') {
      // 如果是数字，可能是索引或真实ID
      // 先尝试作为索引（从1开始）
      if (display > 0 && display <= displays.length) {
        const targetDisplay = displays[display - 1]
        console.log(`[ScreenshotTool] Display index ${display} -> ID ${targetDisplay.id}`)
        return targetDisplay.id
      }
      // 否则直接返回（可能是真实ID）
      console.log(`[ScreenshotTool] Using display ID directly: ${display}`)
      return display
    }

    if (typeof display === 'string') {
      const normalized = display.toLowerCase().trim()

      // 主显示器
      if (['main', '主屏', '主显示器', '笔记本', '内屏'].includes(normalized)) {
        const primaryDisplay = screen.getPrimaryDisplay()
        console.log(`[ScreenshotTool] Primary display ID: ${primaryDisplay.id}`)
        return primaryDisplay.id
      }

      // 副显示器
      if (['secondary', '副屏', '副显示器', '外接', '外屏', '第二屏'].includes(normalized)) {
        if (displays.length > 1) {
          // 找到非主显示器
          const primaryId = screen.getPrimaryDisplay().id
          const secondaryDisplay = displays.find(d => d.id !== primaryId)
          if (secondaryDisplay) {
            console.log(`[ScreenshotTool] Secondary display ID: ${secondaryDisplay.id}`)
            return secondaryDisplay.id
          }
        }
        console.log('[ScreenshotTool] No secondary display found')
        return null
      }

      // 尝试解析为数字索引
      const num = Number.parseInt(display, 10)
      if (Number.isNaN(num) === false && num > 0 && num <= displays.length) {
        const targetDisplay = displays[num - 1]
        console.log(`[ScreenshotTool] Display index ${num} -> ID ${targetDisplay.id}`)
        return targetDisplay.id
      }
    }

    return null
  }

  /**
   * 获取 PNG 图片尺寸
   */
  private getPNGDimensions(data: Buffer): { width: number, height: number } {
    try {
      // PNG 文件格式：前8字节是签名，然后是 IHDR 块
      // IHDR 块包含宽度和高度信息（各4字节，大端序）
      if (data.length < 24) {
        return { width: 0, height: 0 }
      }

      // 检查 PNG 签名
      const signature = data.subarray(0, 8)
      const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])

      if (!signature.equals(pngSignature)) {
        return { width: 0, height: 0 }
      }

      // 读取 IHDR 块中的宽度和高度
      const width = data.readUInt32BE(16)
      const height = data.readUInt32BE(20)

      return { width, height }
    }
    catch (error) {
      console.error('[ScreenshotTool] Failed to parse PNG dimensions:', error)
      return { width: 0, height: 0 }
    }
  }

  /**
   * 获取所有显示器信息
   */
  public getDisplaysInfo(): Array<{
    id: number
    index: number
    bounds: { x: number, y: number, width: number, height: number }
    workArea: { x: number, y: number, width: number, height: number }
    scaleFactor: number
    rotation: number
    internal: boolean
    primary: boolean
  }> {
    const displays = screen.getAllDisplays()
    const primaryId = screen.getPrimaryDisplay().id
    return displays.map((display, index) => ({
      id: display.id, // 使用真实的显示器 ID
      index: index + 1, // 添加索引信息（从1开始）
      bounds: display.bounds,
      workArea: display.workArea,
      scaleFactor: display.scaleFactor,
      rotation: display.rotation,
      internal: display.internal,
      primary: display.id === primaryId, // 标记是否为主显示器
    }))
  }
}
