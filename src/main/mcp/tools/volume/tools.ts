/**
 * 音量控制工具定义
 */

import { getLogger } from '../../../utils/logger'
import { SystemVolumeController } from '../../../utils/SystemVolumeController'
import { PropertyList, PropertyType } from '../../types'
import { defineTool } from '../registry'

const logger = getLogger('VolumeTools')
const volumeController = new SystemVolumeController()

/**
 * 设置音量
 */
defineTool({
  name: 'self.audio_speaker.set_volume',
  description: `Set the system speaker volume to an absolute value (0-100).
Use when user mentions: volume, sound, louder, quieter, mute, unmute, adjust volume.
Examples: 'set volume to 50', 'turn volume up', 'make it louder', 'mute', '音量设为50', '调大声音', '声音小一点', '静音'.
Parameter:
- volume: Integer (0-100) representing the target volume level. Set to 0 for mute.`,
  properties: new PropertyList([
    {
      name: 'volume',
      type: PropertyType.INTEGER,
      minValue: 0,
      maxValue: 100,
    },
  ]),
  callback: async (args: Record<string, unknown>): Promise<string> => {
    try {
      const volume = args.volume as number

      logger.info(`设置音量到 ${volume}`)

      if (volume < 0 || volume > 100) {
        logger.warn(`音量值超出范围: ${volume}`)
        return 'false'
      }

      await volumeController.setVolume(volume)
      logger.info(`音量设置成功: ${volume}`)
      return 'true'
    }
    catch (error) {
      logger.error('设置音量失败:', error)
      return 'false'
    }
  },
})

/**
 * 获取音量
 */
defineTool({
  name: 'self.audio_speaker.get_volume',
  description: `Get the current system speaker volume level.
Use when user asks about: current volume, volume level, how loud, what's the volume.
Examples: 'what is the current volume?', 'how loud is it?', 'check volume level', '现在音量多少?', '查看音量', '音量是多少'.
Returns:
- Integer (0-100) representing the current volume level.`,
  properties: new PropertyList([]),
  callback: async (_args: Record<string, unknown>): Promise<string> => {
    try {
      logger.info('获取当前音量')

      const currentVolume = await volumeController.getVolume()
      logger.info(`当前音量: ${currentVolume}`)
      return String(currentVolume)
    }
    catch (error) {
      logger.error('获取音量失败:', error)
      return '70'
    }
  },
})
