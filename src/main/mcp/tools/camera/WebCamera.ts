import type { AnalyzeResult, CameraConfig, CaptureResult } from './types'

/**
 * Web 摄像头实现
 * 通过渲染进程 getUserMedia 捕获图像，使用远程 API 分析
 */
import { Buffer } from 'node:buffer'
import { BrowserWindow, ipcMain } from 'electron'
import sharp from 'sharp'
import { BaseCamera } from './BaseCamera'

export class WebCamera extends BaseCamera {
  private static instance: WebCamera | null = null
  private explainUrl = ''
  private explainToken = ''
  private deviceId = ''
  private clientId = ''

  private constructor(config?: Partial<CameraConfig>) {
    super(config)
    console.log('[WebCamera] 初始化 Web 摄像头')
  }

  static getInstance(config?: Partial<CameraConfig>): WebCamera {
    if (!WebCamera.instance) {
      WebCamera.instance = new WebCamera(config)
    }
    return WebCamera.instance
  }

  /**
   * 设置解释服务 URL
   */
  setExplainUrl(url: string): void {
    this.explainUrl = url
    console.log(`[WebCamera] Vision service URL 设置为: ${url}`)
  }

  /**
   * 设置解释服务 Token
   */
  setExplainToken(token: string): void {
    this.explainToken = token
    if (token)
      console.log('[WebCamera] Vision service token 已设置')
  }

  /**
   * 设置设备 ID
   */
  setDeviceId(deviceId: string): void {
    this.deviceId = deviceId
  }

  /**
   * 设置客户端 ID
   */
  setClientId(clientId: string): void {
    this.clientId = clientId
  }

  /**
   * 捕获图像（通过 IPC 调用渲染进程）
   */
  async capture(): Promise<CaptureResult> {
    try {
      console.log('[WebCamera] 开始捕获图像...')

      // 获取当前焦点窗口
      const win = BrowserWindow.getFocusedWindow()
      if (!win) {
        console.error('[WebCamera] 未找到焦点窗口')
        return { success: false, message: '未找到焦点窗口' }
      }

      // 通知渲染进程捕获图像
      win.webContents.send('camera:request-capture')

      // 等待渲染进程返回图像数据（设置超时 10 秒）
      const imageData = await new Promise<Buffer>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('捕获图像超时'))
        }, 10000)

        ipcMain.once('camera:capture-result', (_event, data: { success: boolean, data?: Uint8Array, message?: string }) => {
          clearTimeout(timeout)
          if (data.success && data.data) {
            // 将 Uint8Array 转换为 Buffer
            resolve(Buffer.from(data.data))
          }
          else {
            reject(new Error(data.message || '捕获失败'))
          }
        })
      })

      // 使用 sharp 压缩和调整大小
      const resizedBuffer = await sharp(imageData)
        .resize(this.config.maxDimension, this.config.maxDimension, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: this.config.jpegQuality })
        .toBuffer()

      this.setJpegBuffer(resizedBuffer)
      console.log(`[WebCamera] 图像捕获成功 (大小: ${resizedBuffer.length} 字节)`)

      return { success: true, data: resizedBuffer }
    }
    catch (error) {
      console.error('[WebCamera] 捕获图像失败:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : '捕获图像失败',
      }
    }
  }

  /**
   * 分析图像（使用远程 API）
   */
  async analyze(question: string): Promise<AnalyzeResult> {
    try {
      if (!this.explainUrl) {
        return {
          success: false,
          message: 'Image explain URL is not set',
        }
      }

      if (!this.jpegBuffer) {
        return {
          success: false,
          message: 'Camera buffer is empty',
        }
      }

      console.log(`[WebCamera] 开始分析图像, 问题: ${question}`)

      // 准备 FormData
      const formData = new FormData()
      formData.append('question', question)
      const blob = new Blob([Uint8Array.from(this.jpegBuffer)], { type: 'image/jpeg' })
      formData.append('file', blob, 'camera.jpg')

      // 准备请求头
      const headers: Record<string, string> = {}
      if (this.deviceId)
        headers['Device-Id'] = this.deviceId

      if (this.clientId)
        headers['Client-Id'] = this.clientId

      if (this.explainToken)
        headers.Authorization = `Bearer ${this.explainToken}`

      // 发送请求
      const response = await fetch(this.explainUrl, {
        method: 'POST',
        headers,
        body: formData,
      })

      if (!response.ok) {
        const errorMsg = `Failed to upload photo, status code: ${response.status}`
        console.error(`[WebCamera] ${errorMsg}`)
        return { success: false, message: errorMsg }
      }

      const result = await response.text()
      console.log(`[WebCamera] 分析完成: ${result}`)

      // 尝试解析 JSON
      try {
        const jsonResult = JSON.parse(result)
        return {
          success: jsonResult.success ?? true,
          text: jsonResult.text,
          message: jsonResult.message,
        }
      }
      catch {
        // 如果不是 JSON，直接返回文本
        return { success: true, text: result }
      }
    }
    catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to analyze image'
      console.error('[WebCamera] 分析图像失败:', error)
      return { success: false, message: errorMsg }
    }
  }
}
