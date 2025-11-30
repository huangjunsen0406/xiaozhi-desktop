/**
 * Camera 工具统一入口
 * 根据配置返回对应的摄像头实现
 */
import type { BaseCamera } from './BaseCamera'
import { getLogger } from '../../../utils/logger'
import { VLCamera } from './VLCamera'

import { WebCamera } from './WebCamera'

const logger = getLogger('Index')

/** 摄像头配置 */
interface CameraOptions {
  /** VL API Key（可选） */
  vlApiKey?: string
  /** VL URL（可选） */
  vlUrl?: string
  /** VL 模型（可选） */
  vlModel?: string
  /** Explain URL（用于 WebCamera） */
  explainUrl?: string
  /** Explain Token（用于 WebCamera） */
  explainToken?: string
  /** Device ID */
  deviceId?: string
  /** Client ID */
  clientId?: string
}

/**
 * 获取摄像头实例
 * 根据配置返回 VLCamera 或 WebCamera
 */
export function getCameraInstance(options: CameraOptions): BaseCamera {
  // 检查是否配置了智普 AI
  if (options.vlApiKey && options.vlUrl) {
    logger.info(`使用 VL Camera，URL: ${options.vlUrl}`)
    const camera = VLCamera.getInstance(
      options.vlApiKey,
      options.vlUrl,
      options.vlModel || 'glm-4v-plus',
    )
    return camera
  }

  logger.info('VL 配置未找到，使用 WebCamera 实现')
  const camera = WebCamera.getInstance()

  if (options.explainUrl) {
    camera.setExplainUrl(options.explainUrl)
  }

  if (options.explainToken) {
    camera.setExplainToken(options.explainToken)
  }

  if (options.deviceId) {
    camera.setDeviceId(options.deviceId)
  }

  if (options.clientId) {
    camera.setClientId(options.clientId)
  }

  return camera
}

/**
 * 拍照并分析的工具函数
 */
export async function takePhoto(
  question: string,
  options: CameraOptions,
): Promise<string> {
  try {
    const camera = getCameraInstance(options)
    logger.info(`使用摄像头实现: ${camera.constructor.name}`)
    logger.info(`拍照问题: ${question}`)

    // 拍照
    const captureResult = await camera.capture()
    if (!captureResult.success) {
      logger.error('拍照失败', captureResult.message)
      return JSON.stringify({
        success: false,
        message: captureResult.message || 'Failed to capture photo',
      })
    }

    logger.info('拍照成功，开始分析...')

    // 分析图片
    const analyzeResult = await camera.analyze(question)
    return JSON.stringify(analyzeResult)
  }
  catch (error) {
    logger.error('拍照并分析失败', error)
    return JSON.stringify({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

// 导出类型和类
export { BaseCamera } from './BaseCamera'
export type * from './types'
export { VLCamera } from './VLCamera'
export { WebCamera } from './WebCamera'
