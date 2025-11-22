import type { Buffer } from 'node:buffer'
/**
 * 摄像头基类
 * 定义摄像头的通用接口
 */
import type { AnalyzeResult, CameraConfig, CaptureResult } from './types'

export abstract class BaseCamera {
  protected jpegBuffer: Buffer | null = null
  protected config: CameraConfig

  protected constructor(config?: Partial<CameraConfig>) {
    this.config = {
      cameraIndex: config?.cameraIndex ?? 0,
      frameWidth: config?.frameWidth ?? 640,
      frameHeight: config?.frameHeight ?? 480,
      maxDimension: config?.maxDimension ?? 320,
      jpegQuality: config?.jpegQuality ?? 80,
    }
  }

  /**
   * 捕获图像
   * @returns 捕获结果
   */
  abstract capture(): Promise<CaptureResult>

  /**
   * 分析图像
   * @param question - 问题描述
   * @returns 分析结果
   */
  abstract analyze(question: string): Promise<AnalyzeResult>

  /**
   * 获取 JPEG 数据
   */
  getJpegBuffer(): Buffer | null {
    return this.jpegBuffer
  }

  /**
   * 设置 JPEG 数据
   */
  setJpegBuffer(buffer: Buffer): void {
    this.jpegBuffer = buffer
  }

  /**
   * 获取配置
   */
  getConfig(): CameraConfig {
    return { ...this.config }
  }
}
