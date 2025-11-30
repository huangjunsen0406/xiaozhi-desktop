/**
 * 系统音量控制器
 * 跨平台系统音量控制（macOS、Windows、Linux）
 * 使用 easy-volume 库实现
 */
import { getMute, getVolume, setMute, setVolume } from 'easy-volume'
import { createLogger } from './logger'

const logger = createLogger('SystemVolumeController')

export class SystemVolumeController {
  /**
   * 获取当前系统音量 (0-100)
   */
  async getVolume(): Promise<number> {
    try {
      const volume = await getVolume()
      logger.info(`系统音量: ${volume}%`)
      return volume
    }
    catch (error) {
      logger.error('获取系统音量失败', error)
      return 70 // 默认值
    }
  }

  /**
   * 设置系统音量 (0-100)
   * @param volume 音量值 (0-100)
   */
  async setVolume(volume: number): Promise<void> {
    // 限制音量范围
    const clampedVolume = Math.max(0, Math.min(100, Math.round(volume)))

    try {
      await setVolume(clampedVolume)
      logger.info(`系统音量已设置: ${clampedVolume}%`)
    }
    catch (error) {
      logger.error(`设置系统音量失败 (${clampedVolume}%):`, error)
      throw error
    }
  }

  /**
   * 获取静音状态
   */
  async getMute(): Promise<boolean> {
    try {
      const isMuted = await getMute()
      logger.info(`静音状态: ${isMuted}`)
      return isMuted
    }
    catch (error) {
      logger.error('获取静音状态失败', error)
      return false
    }
  }

  /**
   * 设置静音状态
   * @param muted true = 静音, false = 取消静音
   */
  async setMute(muted: boolean): Promise<void> {
    try {
      await setMute(muted)
      logger.info(`静音状态已设置: ${muted}`)
    }
    catch (error) {
      logger.error(`设置静音状态失败 (${muted}):`, error)
      throw error
    }
  }

  /**
   * 检查平台是否支持系统音量控制
   * easy-volume 支持 Windows、macOS、Linux
   */
  isSupported(): boolean {
    // easy-volume 已内部处理平台检测，始终返回 true
    return true
  }
}
