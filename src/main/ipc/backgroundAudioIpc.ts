import type { BackgroundAudioStateUpdate, BackgroundAudioStatus } from '@shared/types'
import { ipcMain } from 'electron'
import { getLogger } from '../utils/logger'
import { createIpcHandler, success } from './middleware'
import { optionalBoolean, optionalString, parseObject } from './middleware/validation'

const logger = getLogger('BackgroundAudioIpc')

let audioStatus: BackgroundAudioStatus = {
  initialized: false,
  capturing: false,
  playing: false,
}

export function registerBackgroundAudioIpc(): void {
  createIpcHandler({
    channel: 'background-audio:get-status',
    handler: () => success(audioStatus),
  })

  ipcMain.on('audio:state', (_, value: unknown) => {
    try {
      const input = parseObject(value)
      const state: BackgroundAudioStateUpdate = {
        initialized: optionalBoolean(input, 'initialized'),
        capturing: optionalBoolean(input, 'capturing'),
        playing: optionalBoolean(input, 'playing'),
        inputDeviceId: optionalString(input, 'inputDeviceId'),
        outputDeviceId: optionalString(input, 'outputDeviceId'),
        currentInputDeviceId: optionalString(input, 'currentInputDeviceId'),
        currentOutputDeviceId: optionalString(input, 'currentOutputDeviceId'),
        error: optionalString(input, 'error'),
      }
      const previous = audioStatus
      audioStatus = {
        initialized: state.initialized ?? audioStatus.initialized,
        capturing: state.capturing ?? audioStatus.capturing,
        playing: state.playing ?? audioStatus.playing,
        inputDeviceId: state.inputDeviceId ?? audioStatus.inputDeviceId,
        outputDeviceId: state.outputDeviceId ?? audioStatus.outputDeviceId,
        currentInputDeviceId: state.currentInputDeviceId ?? audioStatus.currentInputDeviceId,
        currentOutputDeviceId: state.currentOutputDeviceId ?? audioStatus.currentOutputDeviceId,
        error: state.error,
      }
      if (state.error) {
        logger.warn('后台音频错误', state.error)
      }
      else if (previous.initialized !== audioStatus.initialized || previous.capturing !== audioStatus.capturing) {
        logger.info('后台音频状态变化', {
          initialized: audioStatus.initialized,
          capturing: audioStatus.capturing,
        })
      }
    }
    catch (error) {
      logger.warn('忽略无效音频状态更新:', error)
    }
  })

  logger.info('后台音频 IPC 通道已注册')
}
