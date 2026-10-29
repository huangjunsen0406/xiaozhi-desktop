import type { RendererApi } from '../shared/rendererApi'

declare global {
  interface Window {
    api: RendererApi
  }
}
