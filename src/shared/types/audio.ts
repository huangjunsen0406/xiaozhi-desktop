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

/**
 * 用户音频偏好（Settings DTO）
 *
 * 与主进程 AudioRuntime（编解码 / hello 参数缓存）分离。
 * IPC `audio:get-config` / `audio:update-config` 读写本结构。
 * 依赖方向：UI → Settings → Runtime → Protocol / Codec
 */
export interface AudioSettings {
  inputDeviceName?: string
  outputDeviceName?: string
  microphoneVolume?: number
  speakerVolume?: number
  enableNoiseReduction?: boolean
  /** 本地 AEC 开关（Chromium/采集侧）；不进入协议 hello features */
  enableEchoCancellation?: boolean
  conversationMode?: 'realtime' | 'auto'
  // 高级音频参数（偏好；生效需 runtime.reload + codec rebuild）
  inputSampleRate?: ValidSampleRate
  outputSampleRate?: ValidSampleRate
  channels?: number
  frameDuration?: number
}

/**
 * @deprecated 使用 AudioSettings；IPC 与 shared 兼容别名
 */
export type AudioConfig = AudioSettings

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
