declare module 'pixi-live2d-display/cubism4' {
  import type * as PIXI from 'pixi.js'

  export class Live2DModel extends PIXI.Container {
    static from(source: string, options?: any): Promise<Live2DModel>
    on(event: string, fn: (...args: any[]) => void, context?: any): this
    getBounds(): PIXI.Rectangle
  }
}

declare module '@pixi/unsafe-eval' {
  export function install(pixi: any): void
}
