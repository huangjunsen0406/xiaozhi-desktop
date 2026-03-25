import type { ValidSampleRate } from '@shared/types'
import { DatabaseManager } from '../services/database'
import { getLogger } from '../utils/logger'

const logger = getLogger('AudioConfig')

const VALID_RATES: readonly number[] = [8000, 12000, 16000, 24000, 48000]

function isValidRate(rate: number): rate is ValidSampleRate {
  return VALID_RATES.includes(rate)
}

export interface AudioParams {
  inputSampleRate: ValidSampleRate
  outputSampleRate: ValidSampleRate
  channels: number
  frameDuration: number
}

class AudioConfigClass {
  private config: AudioParams | null = null

  private getConfig(): AudioParams {
    if (!this.config) {
      this.config = this.loadConfig()
    }
    return this.config
  }

  private loadConfig(): AudioParams {
    try {
      const db = DatabaseManager.getInstance()
      const dbConfig = db.getFormattedAudioConfig()

      const inputRate = dbConfig.inputSampleRate
      const outputRate = dbConfig.outputSampleRate

      return {
        inputSampleRate: isValidRate(inputRate) ? inputRate : 16000,
        outputSampleRate: isValidRate(outputRate) ? outputRate : 24000,
        channels: dbConfig.channels || 1,
        frameDuration: dbConfig.frameDuration || 20,
      }
    }
    catch (error) {
      logger.warn('使用默认配置', error)
      return {
        inputSampleRate: 16000,
        outputSampleRate: 24000,
        channels: 1,
        frameDuration: 20,
      }
    }
  }

  /**
   * 重新加载配置
   * 在设置更新后调用
   */
  reload(): void {
    this.config = this.loadConfig()
    logger.info('配置已重新加载:', this.config)
  }

  get inputSampleRate() { return this.getConfig().inputSampleRate }
  get outputSampleRate() { return this.getConfig().outputSampleRate }
  get channels() { return this.getConfig().channels }
  get frameDuration() { return this.getConfig().frameDuration }

  get inputFrameSize() {
    return Math.floor(this.inputSampleRate * (this.frameDuration / 1000))
  }

  get outputFrameSize() {
    return Math.floor(this.outputSampleRate * (this.frameDuration / 1000))
  }
}

// 导出单例
export const AudioConfig = new AudioConfigClass()
