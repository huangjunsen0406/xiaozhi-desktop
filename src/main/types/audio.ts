/**
 * 音频设备信息接口
 */
export interface AudioDeviceInfo {
  deviceId: string
  groupId: string
  kind: 'audioinput' | 'audiooutput'
  label: string
}

/**
 * 音频配置接口
 */
export interface AudioConfig {
  // 输入设备名称（通过名称匹配设备ID）
  inputDeviceName?: string
  // 输出设备名称（通过名称匹配设备ID）
  outputDeviceName?: string
  // 麦克风音量 (0-100)
  microphoneVolume: number
  // 扬声器音量 (0-100)
  speakerVolume: number
  // 噪音抑制
  enableNoiseReduction: boolean
  // 回声消除
  enableEchoCancellation: boolean
  // 对话模式: 'realtime' 实时对话 | 'auto' 自动对话(回合制)
  conversationMode: 'realtime' | 'auto'
}

/**
 * 音频设备列表接口
 */
export interface AudioDeviceList {
  inputs: AudioDeviceInfo[]
  outputs: AudioDeviceInfo[]
}

/**
 * 音频监听器接口
 * 用于订阅 AudioPlugin 的音频流（观察者模式）
 */
export interface AudioListener {
  /**
   * 监听器名称（用于日志）
   */
  readonly name: string

  /**
   * 接收音频数据的回调
   * @param pcmData - PCM 音频数据 (Int16Array, 16kHz, 单声道)
   */
  onAudioData: (pcmData: Int16Array) => void
}
