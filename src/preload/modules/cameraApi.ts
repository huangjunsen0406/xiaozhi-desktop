import { ipcRenderer } from 'electron'
import { subscribeChannel } from '../utils/ipc'

export const cameraApi = {
  onCaptureRequest: (callback: () => void): (() => void) =>
    subscribeChannel('camera:request-capture', () => callback()),

  sendCaptureResult: (success: boolean, data?: Uint8Array, message?: string): void => {
    ipcRenderer.send('camera:capture-result', { success, data, message })
  },
}
