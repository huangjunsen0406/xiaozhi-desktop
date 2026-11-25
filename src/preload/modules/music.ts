import { ipcRenderer } from 'electron'
import { subscribeChannel } from '../utils/ipc'

export const musicApi = {
  onCommand: (callback: (message: { command: string, args?: Record<string, unknown> }) => void): (() => void) =>
    subscribeChannel('music:command', callback),

  statusUpdate: (status: Record<string, unknown>): void => {
    ipcRenderer.send('music:status-update', status)
  },
}
