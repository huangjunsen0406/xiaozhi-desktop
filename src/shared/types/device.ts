export interface DeviceFingerprint {
  system: string
  hostname: string
  mac_address: string
  machine_id: string
}

export interface DeviceInfo {
  serialNumber: string
  macAddress: string
  activationStatus: boolean
  deviceFingerprint?: DeviceFingerprint
}

export const DeviceStateValue = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  LISTENING: 'listening',
  SPEAKING: 'speaking',
} as const

export type DeviceState = typeof DeviceStateValue[keyof typeof DeviceStateValue]
