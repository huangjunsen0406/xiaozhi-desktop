import type { DeviceState } from './device'

export const ListeningModeValue = {
  AUTO: 'auto',
  MANUAL: 'manual',
  REALTIME: 'realtime',
} as const

export type ListeningMode = typeof ListeningModeValue[keyof typeof ListeningModeValue]

export interface AppStateSnapshot {
  deviceState: DeviceState
  listeningMode: ListeningMode
  keepListening: boolean
  channelOpen: boolean
}

// 兼容旧命名
export type AppStateSnapshotRaw = AppStateSnapshot
