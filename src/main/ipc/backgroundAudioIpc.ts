import type { BackgroundAudioStateUpdate, BackgroundAudioStatus } from '@shared/types'
import { ipcMain } from 'electron'
import { getLogger } from '../utils/logger'
import { getBackgroundAudioWindow } from '../windows/windowManager'
import { createIpcHandler, success } from './middleware'
import { optionalBoolean, optionalString, parseObject } from './middleware/validation'

const logger = getLogger('BackgroundAudioIpc')

let audioStatus: BackgroundAudioStatus = {
  initialized: false,
  capturing: false,
  playing: false,
}

export function registerBackgroundAudioIpc(): void {
  function sendAudioCommand(command: string, data?: Record<string, unknown>): void {
    const audioWindow = getBackgroundAudioWindow()
    if (audioWindow && !audioWindow.isDestroyed()) {
      if (data !== undefined) {
        audioWindow.webContents.send('audio:command', command, data)
      }
      else {
        audioWindow.webContents.send('audio:command', command)
      }
    }
    else {
      logger.warn('后台音频窗口不存在或已销毁')
    }
  }

  // 切换音频设备（用户在设置中更改设备时调用）
  createIpcHandler({
    channel: 'background-audio:switch-devices',
    handler: async () => {
      sendAudioCommand('switchDevices')
      return success()
    },
  })

  // 清理资源（仅在应用退出时调用）
  createIpcHandler({
    channel: 'background-audio:cleanup',
    handler: async () => {
      sendAudioCommand('cleanup')
      return success()
    },
  })

  // 获取音频状态
  createIpcHandler({
    channel: 'background-audio:get-status',
    handler: async () => {
      return success(audioStatus)
    },
  })

  // 监听音频状态更新（事件推送，非 handle）
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
        // A normal report clears a previous error; omitted device/state fields keep their values.
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
