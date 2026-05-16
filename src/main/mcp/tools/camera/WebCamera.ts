import type { AnalyzeResult, CameraToolConfig } from './types'

/**
 * Web 摄像头实现
 * 通过渲染进程 getUserMedia 捕获图像，使用远程 API 分析
 */
import { getLogger } from '../../../utils/logger'

import { BaseCamera } from './BaseCamera'

const logger = getLogger('WebCamera')

export class WebCamera extends BaseCamera {
  private static instance: WebCamera | null = null
  private explainUrl = ''
  private explainToken = ''
  private deviceId = ''
  private clientId = ''

  private constructor(config?: Partial<CameraToolConfig>) {
    super(config)
    logger.info('初始化 Web 摄像头')
  }

  static getInstance(config?: Partial<CameraToolConfig>): WebCamera {
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
    logger.info(`Vision service URL 设置为: ${url}`)
  }

  /**
   * 设置解释服务 Token
   */
  setExplainToken(token: string): void {
    this.explainToken = token
    if (token)
      logger.info('Vision service token 已设置')
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

      logger.info(`开始分析图像, 问题: ${question}`)

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
        logger.error(errorMsg)
        return { success: false, message: errorMsg }
      }

      const result = await response.text()
      logger.info(`分析完成: ${result}`)

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
      logger.error('分析图像失败', error)
      return { success: false, message: errorMsg }
    }
  }
}
