/**
 * 第三方最小类型补丁（非业务 any）。
 * pixi-live2d-display / @pixi/unsafe-eval 无完整官方类型时的占位；
 * 使用 unknown，避免业务路径依赖 any。
 */
declare module 'pixi-live2d-display/cubism4' {
  import type * as PIXI from 'pixi.js'

  export class Live2DModel extends PIXI.Container {
    static from(source: string, options?: Record<string, unknown>): Promise<Live2DModel>
    on(event: string, fn: (...args: unknown[]) => void, context?: unknown): this
    getBounds(): PIXI.Rectangle
  }
}

declare module '@pixi/unsafe-eval' {
  export function install(pixi: unknown): void
}
