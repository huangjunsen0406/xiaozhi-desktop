/**
 * 设备状态枚举
 */
export enum DeviceState {
  IDLE = 'idle',
  CONNECTING = 'connecting',
  LISTENING = 'listening',
  SPEAKING = 'speaking',
}

/**
 * 事件类型
 */
export enum EventType {
  SCHEDULE_EVENT = 'schedule_event',
  AUDIO_INPUT_READY_EVENT = 'audio_input_ready_event',
  AUDIO_OUTPUT_READY_EVENT = 'audio_output_ready_event',
}

/**
 * 音频配置常量
 */
export const AudioConfig = {
  // 固定配置
  INPUT_SAMPLE_RATE: 16000, // 输入采样率 16kHz
  OUTPUT_SAMPLE_RATE: 24000, // 输出采样率 24kHz（官方服务器）
  CHANNELS: 1, // 单声道
  MAX_INPUT_CHANNELS: 2, // 最多使用2个输入声道
  MAX_OUTPUT_CHANNELS: 2, // 最多使用2个输出声道
  FRAME_DURATION: 20, // 帧长度 20ms（桌面设备）

  // 计算帧大小
  get INPUT_FRAME_SIZE() {
    return Math.floor(this.INPUT_SAMPLE_RATE * (this.FRAME_DURATION / 1000))
  },
  get OUTPUT_FRAME_SIZE() {
    return Math.floor(this.OUTPUT_SAMPLE_RATE * (this.FRAME_DURATION / 1000))
  },
} as const
