import type { Buffer } from 'node:buffer'
import type { AnalyzeResult, CameraToolConfig, CaptureResult } from './types'

export abstract class BaseCamera {
  protected jpegBuffer: Buffer | null = null
  protected config: CameraToolConfig

  protected constructor(config?: Partial<CameraToolConfig>) {
    this.config = {
      cameraIndex: config?.cameraIndex ?? 0,
      frameWidth: config?.frameWidth ?? 640,
      frameHeight: config?.frameHeight ?? 480,
      maxDimension: config?.maxDimension ?? 320,
      jpegQuality: config?.jpegQuality ?? 80,
    }
  }

  abstract capture(): Promise<CaptureResult>

  abstract analyze(question: string): Promise<AnalyzeResult>

  getJpegBuffer(): Buffer | null {
    return this.jpegBuffer
  }

  setJpegBuffer(buffer: Buffer): void {
    this.jpegBuffer = buffer
  }

  getConfig(): CameraToolConfig {
    return { ...this.config }
  }
}
