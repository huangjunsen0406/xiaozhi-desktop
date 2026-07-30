import type { BackgroundAudioStatus } from '@shared/types'
import { ipcMain } from 'electron'
import { getLogger } from '../utils/logger'
import { getBackgroundAudioWindow } from '../windows/windowManager'
import { createIpcHandler, success } from './middleware'

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
  ipcMain.on('audio:state', (_, state: { capturing?: boolean, playing?: boolean, error?: string }) => {
    logger.info('收到音频状态更新:', state)

    audioStatus = {
      ...audioStatus,
      capturing: state.capturing ?? audioStatus.capturing,
      playing: state.playing ?? audioStatus.playing,
      error: state.error,
    }
  })

  logger.info('后台音频 IPC 通道已注册')
}
