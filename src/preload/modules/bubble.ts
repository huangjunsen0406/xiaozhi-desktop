import type {
  BubbleLocalShowPayload,
  PetSurfaceContentSize,
  PetSurfaceId,
} from '@shared/types'
import { ipcRenderer } from 'electron'
import { subscribeChannel } from '../utils/ipc'

function parseLocalShowPayload(raw: unknown): BubbleLocalShowPayload | null {
  if (raw == null || typeof raw !== 'object')
    return null
  const obj = raw as Record<string, unknown>
  if (typeof obj.text !== 'string' || obj.text.length === 0)
    return null
  if (obj.source !== 'reminder' && obj.source !== 'plugin')
    return null
  const payload: BubbleLocalShowPayload = {
    text: obj.text,
    source: obj.source,
  }
  if (typeof obj.durationMs === 'number' && Number.isFinite(obj.durationMs) && obj.durationMs > 0)
    payload.durationMs = obj.durationMs
  return payload
}

export const bubbleApi = {
  show: (): void => ipcRenderer.send('bubble:show'),
  hide: (): void => ipcRenderer.send('bubble:hide'),

  setAnchorOffset: (offsetY: number): void => {
    if (typeof offsetY === 'number' && Number.isFinite(offsetY))
      ipcRenderer.send('bubble:set-anchor-offset', offsetY)
  },

  setContentSize: (surface: PetSurfaceId, size: PetSurfaceContentSize): void => {
    if (surface !== 'pets' && surface !== 'live2d' && surface !== 'bubble')
      return
    if (size == null || typeof size !== 'object')
      return
    if (typeof size.width !== 'number' || typeof size.height !== 'number')
      return
    if (!Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0)
      return
    const payload: PetSurfaceContentSize = { width: size.width, height: size.height }
    if (typeof size.anchorOffsetY === 'number' && Number.isFinite(size.anchorOffsetY))
      payload.anchorOffsetY = size.anchorOffsetY
    ipcRenderer.send('pet-shell:set-content-size', surface, payload)
  },

  onSetArrowX: (callback: (x: number) => void): (() => void) =>
    subscribeChannel('bubble:set-arrow-x', (x: unknown) => {
      if (typeof x === 'number' && Number.isFinite(x))
        callback(x)
    }),

  onShowLocal: (callback: (payload: BubbleLocalShowPayload) => void): (() => void) => {
    const unsubscribe = subscribeChannel('bubble:show-local', (raw: unknown) => {
      const payload = parseLocalShowPayload(raw)
      if (payload)
        callback(payload)
    })
    ipcRenderer.send('bubble:local-ready')
    return unsubscribe
  },

  onHideLocal: (callback: () => void): (() => void) =>
    subscribeChannel('bubble:hide-local', () => callback()),
}
