import { onUnmounted } from 'vue'
import { captureFromWebcam } from '../utils/camera'

/** Camera capture requests have an independent lifecycle from application state. */
export function useCameraCaptureRequests(): void {
  let disposed = false
  const unsubscribe = window.api.cameraOnCaptureRequest(async () => {
    try {
      const config = await window.api.cameraConfigGetConfig()
      if (disposed)
        return
      const image = await captureFromWebcam(
        config.captureWidth || 640,
        config.captureHeight || 480,
        config.deviceId || undefined,
      )
      const data = new Uint8Array(await image.arrayBuffer())
      if (!disposed)
        window.api.cameraSendCaptureResult(true, data)
    }
    catch (error) {
      if (!disposed) {
        window.api.cameraSendCaptureResult(
          false,
          undefined,
          error instanceof Error ? error.message : '摄像头捕获失败',
        )
      }
    }
  })
  onUnmounted(() => {
    disposed = true
    unsubscribe()
  })
}
