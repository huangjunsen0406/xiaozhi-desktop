export interface AudioDeviceInfo {
  deviceId: string
  groupId: string
  kind: 'audioinput' | 'audiooutput'
  label: string
}

/**
 * Opus 支持的有效采样率
 */
export type ValidSampleRate = 8000 | 12000 | 16000 | 24000 | 48000

export interface AudioConfig {
  inputDeviceName?: string
  outputDeviceName?: string
  microphoneVolume?: number
  speakerVolume?: number
  enableNoiseReduction?: boolean
  enableEchoCancellation?: boolean
  conversationMode?: 'realtime' | 'auto'
  // 高级音频参数
  inputSampleRate?: ValidSampleRate
  outputSampleRate?: ValidSampleRate
  channels?: number
  frameDuration?: number
}

export interface AudioDeviceList {
  inputs: AudioDeviceInfo[]
  outputs: AudioDeviceInfo[]
}

export interface AudioListener {
  readonly name: string
  onAudioData: (pcmData: Int16Array) => void
}

export interface BackgroundAudioStatus {
  initialized: boolean
  capturing: boolean
  playing?: boolean
  inputDeviceId?: string
  outputDeviceId?: string
  currentInputDeviceId?: string
  currentOutputDeviceId?: string
  error?: string
}

export type BackgroundAudioStateUpdate = Partial<BackgroundAudioStatus> & { state?: string }
