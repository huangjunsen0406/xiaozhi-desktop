/**
 * Camera 相关类型定义
 */
import type { Buffer } from 'node:buffer'
/** 相机配置 */
export interface CameraConfig {
  /** 相机索引（默认 0） */
  cameraIndex: number
  /** 画面宽度 */
  frameWidth: number
  /** 画面高度 */
  frameHeight: number
  /** 最大边长（用于压缩） */
  maxDimension: number
  /** JPEG 质量 (0-100) */
  jpegQuality: number
}

/** 拍照结果 */
export interface CaptureResult {
  success: boolean
  message?: string
  data?: Buffer
}

/** 分析结果 */
export interface AnalyzeResult {
  success: boolean
  message?: string
  text?: string
}

/** Vision API 响应 */
export interface VisionResponse {
  success: boolean
  message?: string
  text?: string
}
