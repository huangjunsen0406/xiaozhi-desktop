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
 * Chromium 回声消除模式（设置页下拉）
 *
 * - off：不请求 gUM echoCancellation
 * - app：Chrome-wide 应用内参考（默认）
 * - system：尝试系统 loopback 参考（forced_on，可能需重启 + 系统音频权限）
 */
export type AecMode = 'off' | 'app' | 'system'

/**
 * 运行时 AEC 有效状态（采集侧上报 + 主进程聚合）
 */
export type AecEffective =
  | 'off'
  | 'app'
  | 'system'
  | 'app_fallback'
  | 'unavailable'

export interface AecStatus {
  desired: AecMode
  effective: AecEffective
  reason?: string
  /** track.getSettings().echoCancellation */
  echoCancellationApplied?: boolean
  platform: NodeJS.Platform
  /** 完整系统参考是否可能需重启应用 */
  requiresRelaunch?: boolean
}

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
  /**
   * 回声消除模式（推荐）
   * 未设置时由 enableEchoCancellation 兼容推导
   */
  aecMode?: AecMode
  /**
   * @deprecated 使用 aecMode；true→app，false→off（不会映射为 system）
   * 读写时与 aecMode 双写保持兼容
   */
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
