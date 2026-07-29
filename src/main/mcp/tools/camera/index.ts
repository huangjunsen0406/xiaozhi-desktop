/**
 * Camera 工具统一入口
 * 根据配置返回对应的摄像头实现
 *
 * 工厂模块级 current 实例；配置变更时重建。无 class 静态懒单例。
 */
import type { BaseCamera } from './BaseCamera'
import { getLogger } from '../../../utils/logger'
import { VLCamera } from './VLCamera'

import { WebCamera } from './WebCamera'

const logger = getLogger('Camera')

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

let currentCamera: BaseCamera | null = null
let lastCameraType: 'vl' | 'web' | null = null
let lastVlConfig: { apiKey: string, url: string, model: string } | null = null

/**
 * 获取摄像头实例
 * 根据配置返回 VLCamera 或 WebCamera，配置变更时重建实例
 */
export function getCameraInstance(options: CameraOptions): BaseCamera {
  if (options.vlApiKey && options.vlUrl) {
    const model = options.vlModel || 'glm-4v-plus'
    const configChanged = lastCameraType !== 'vl'
      || lastVlConfig?.apiKey !== options.vlApiKey
      || lastVlConfig?.url !== options.vlUrl
      || lastVlConfig?.model !== model

    if (configChanged || !(currentCamera instanceof VLCamera)) {
      currentCamera = VLCamera.create(options.vlApiKey, options.vlUrl, model)
      logger.info(`使用 VL Camera，URL: ${options.vlUrl}`)
    }

    lastCameraType = 'vl'
    lastVlConfig = { apiKey: options.vlApiKey, url: options.vlUrl, model }

    return currentCamera
  }

  if (lastCameraType !== 'web' || !(currentCamera instanceof WebCamera)) {
    logger.info('VL 配置未找到，使用 WebCamera 实现')
    currentCamera = WebCamera.create()
  }
  lastCameraType = 'web'
  lastVlConfig = null

  const camera = currentCamera as WebCamera

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
 * 重置工厂当前实例（测试用）
 */
export function resetCameraInstance(): void {
  currentCamera = null
  lastCameraType = null
  lastVlConfig = null
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
