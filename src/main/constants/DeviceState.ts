import { DatabaseManager } from '../services/database'

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
 * 音频配置
 * 从数据库动态加载，支持运行时修改
 */
class AudioConfigClass {
  private config: {
    INPUT_SAMPLE_RATE: number
    OUTPUT_SAMPLE_RATE: number
    CHANNELS: number
    MAX_INPUT_CHANNELS: number
    MAX_OUTPUT_CHANNELS: number
    FRAME_DURATION: number
  }

  constructor() {
    this.config = this.loadConfig()
  }

  private loadConfig() {
    try {
      const db = DatabaseManager.getInstance()
      const dbConfig = db.getFormattedAudioConfig()

      return {
        INPUT_SAMPLE_RATE: dbConfig.inputSampleRate || 16000,
        OUTPUT_SAMPLE_RATE: dbConfig.outputSampleRate || 24000,
        CHANNELS: dbConfig.channels || 1,
        MAX_INPUT_CHANNELS: dbConfig.maxInputChannels || 2,
        MAX_OUTPUT_CHANNELS: dbConfig.maxOutputChannels || 2,
        FRAME_DURATION: dbConfig.frameDuration || 20,
      }
    }
    catch (error) {
      // 如果数据库未初始化，使用默认值
      console.warn('[AudioConfig] 使用默认配置:', error)
      return {
        INPUT_SAMPLE_RATE: 16000,
        OUTPUT_SAMPLE_RATE: 24000,
        CHANNELS: 1,
        MAX_INPUT_CHANNELS: 2,
        MAX_OUTPUT_CHANNELS: 2,
        FRAME_DURATION: 20,
      }
    }
  }

  /**
   * 重新加载配置
   * 在设置更新后调用
   */
  reload(): void {
    this.config = this.loadConfig()
    console.log('[AudioConfig] 配置已重新加载:', this.config)
  }

  // Getter 方法
  get INPUT_SAMPLE_RATE() { return this.config.INPUT_SAMPLE_RATE }
  get OUTPUT_SAMPLE_RATE() { return this.config.OUTPUT_SAMPLE_RATE }
  get CHANNELS() { return this.config.CHANNELS }
  get MAX_INPUT_CHANNELS() { return this.config.MAX_INPUT_CHANNELS }
  get MAX_OUTPUT_CHANNELS() { return this.config.MAX_OUTPUT_CHANNELS }
  get FRAME_DURATION() { return this.config.FRAME_DURATION }

  // 计算帧大小
  get INPUT_FRAME_SIZE() {
    return Math.floor(this.INPUT_SAMPLE_RATE * (this.FRAME_DURATION / 1000))
  }

  get OUTPUT_FRAME_SIZE() {
    return Math.floor(this.OUTPUT_SAMPLE_RATE * (this.FRAME_DURATION / 1000))
  }
}

// 导出单例
export const AudioConfig = new AudioConfigClass()
