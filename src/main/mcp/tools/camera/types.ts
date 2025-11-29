import type { Buffer } from 'node:buffer'

export interface CameraToolConfig {
  cameraIndex: number
  frameWidth: number
  frameHeight: number
  maxDimension: number
  jpegQuality: number
}

export interface CaptureResult {
  success: boolean
  message?: string
  data?: Buffer
}

export interface AnalyzeResult {
  success: boolean
  message?: string
  text?: string
}

export interface VisionResponse {
  success: boolean
  message?: string
  text?: string
}
