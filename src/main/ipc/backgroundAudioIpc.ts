import type { BackgroundAudioStatus } from '@shared/types'
import { ipcMain } from 'electron'
import { getLogger } from '../utils/logger'

import { getBackgroundAudioWindow } from '../windows/windowManager'

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

  ipcMain.handle('background-audio:initialize', async () => {
    sendAudioCommand('initialize')
  })

  ipcMain.handle('background-audio:start', async () => {
    sendAudioCommand('start')
  })

  ipcMain.handle('background-audio:stop', async () => {
    sendAudioCommand('stop')
  })

  ipcMain.handle('background-audio:switch-devices', async () => {
    sendAudioCommand('switchDevices')
  })

  ipcMain.handle('background-audio:cleanup', async () => {
    sendAudioCommand('cleanup')
  })

  ipcMain.handle('background-audio:get-status', async () => {
    return audioStatus
  })

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
