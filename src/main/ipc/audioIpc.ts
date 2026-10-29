import { parseAudioSettingsUpdate } from '../audio/audioSettingsValidation'
import { applyAudioSettings, getAecStatus, reportAecCapture } from '../services/audioSettings'
import { getDatabase } from '../services/database'
import { getLogger } from '../utils/logger'
import { SystemVolumeController } from '../utils/SystemVolumeController'
import { createIpcHandler, failure, success } from './middleware'

const logger = getLogger('AudioIpc')
const systemVolumeController = new SystemVolumeController()

/**
 * 注册音频相关的 IPC 通道
 */
export function registerAudioIpc(): void {
  logger.info('注册音频 IPC 通道...')
  const db = getDatabase()

  // 使用中间件注册处理器
  createIpcHandler({
    channel: 'audio:get-config',
    verbose: false,
    handler: async () => {
      const config = db.getFormattedAudioSettings()
      return success(config)
    },
  })

  createIpcHandler({
    channel: 'audio:update-config',
    schema: {
      config: { type: 'object', required: true },
    },
    handler: async (_event, ...args) => {
      const config = parseAudioSettingsUpdate(args[0])
      return success(await applyAudioSettings(config))
    },
  })

  createIpcHandler({
    channel: 'audio:get-aec-status',
    verbose: false,
    handler: async () => {
      return success(getAecStatus())
    },
  })

  createIpcHandler({
    channel: 'audio:report-aec-capture',
    verbose: false,
    schema: {
      payload: { type: 'object', required: true },
    },
    handler: async (_event, ...args) => {
      const payload = args[0] as Record<string, unknown>
      if (payload.echoCancellationApplied !== undefined && typeof payload.echoCancellationApplied !== 'boolean')
        return failure('echoCancellationApplied 必须是布尔值')
      return success(reportAecCapture({ echoCancellationApplied: payload.echoCancellationApplied as boolean | undefined }))
    },
  })

  createIpcHandler({
    channel: 'audio:get-preferred-device-name',
    schema: {
      kind: { type: 'string', required: true },
    },
    handler: async (_event, ...args) => {
      const kind = args[0] as string
      if (kind !== 'input' && kind !== 'output') {
        return failure('kind 必须是 input 或 output')
      }

      const config = db.getFormattedAudioSettings()

      if (kind === 'input') {
        return success(config.inputDeviceName || null)
      }
      else {
        return success(config.outputDeviceName || null)
      }
    },
  })

  createIpcHandler({
    channel: 'audio:system-get-volume',
    handler: async () => {
      const volume = await systemVolumeController.getVolume()
      return success(volume)
    },
  })

  createIpcHandler({
    channel: 'audio:system-set-volume',
    schema: {
      volume: { type: 'number', required: true, min: 0, max: 100 },
    },
    handler: async (_event, ...args) => {
      const volume = args[0] as number
      await systemVolumeController.setVolume(volume)
      logger.info(`系统音量已设置为: ${volume}%`)
      return success()
    },
  })

  createIpcHandler({
    channel: 'audio:system-volume-supported',
    handler: async () => {
      return success(systemVolumeController.isSupported())
    },
  })

  logger.info('音频 IPC 通道已注册')
}
