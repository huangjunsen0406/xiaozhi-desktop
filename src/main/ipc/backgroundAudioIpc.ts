import { ipcMain } from 'electron'
import { getBackgroundAudioWindow } from '../windows/windowManager'

/**
 * 后台音频状态
 */
interface BackgroundAudioStatus {
  initialized: boolean
  capturing: boolean
  playing: boolean
  currentInputDeviceId?: string
  currentOutputDeviceId?: string
  error?: string
}

// 存储后台音频状态
let audioStatus: BackgroundAudioStatus = {
  initialized: false,
  capturing: false,
  playing: false,
}

/**
 * 注册后台音频窗口的 IPC 通道
 * 提供对后台音频窗口的控制接口
 */
export function registerBackgroundAudioIpc(): void {
  /**
   * 向后台音频窗口发送命令
   */
  function sendAudioCommand(command: string, data?: Record<string, unknown>): void {
    const audioWindow = getBackgroundAudioWindow()
    if (audioWindow && !audioWindow.isDestroyed()) {
      // 只在 data 有值时才传递第三个参数，避免传递 undefined 导致 IPC 序列化错误
      if (data !== undefined) {
        audioWindow.webContents.send('audio:command', command, data)
      }
      else {
        audioWindow.webContents.send('audio:command', command)
      }
    }
    else {
      console.warn('[BackgroundAudioIpc] 后台音频窗口不存在或已销毁')
    }
  }

  /**
   * 初始化音频系统
   */
  ipcMain.handle('background-audio:initialize', async () => {
    sendAudioCommand('initialize')
  })

  /**
   * 开始音频采集
   */
  ipcMain.handle('background-audio:start', async () => {
    sendAudioCommand('start')
  })

  /**
   * 停止音频采集
   */
  ipcMain.handle('background-audio:stop', async () => {
    sendAudioCommand('stop')
  })

  /**
   * 切换音频设备
   */
  ipcMain.handle('background-audio:switch-devices', async () => {
    sendAudioCommand('switchDevices')
  })

  /**
   * 清理音频资源
   */
  ipcMain.handle('background-audio:cleanup', async () => {
    sendAudioCommand('cleanup')
  })

  /**
   * 获取后台音频状态
   */
  ipcMain.handle('background-audio:get-status', async () => {
    return audioStatus
  })

  /**
   * 接收来自后台音频窗口的状态更新
   */
  ipcMain.on('audio:state', (_, state: { capturing?: boolean, playing?: boolean, error?: string }) => {
    console.log('[BackgroundAudioIpc] 收到音频状态更新:', state)

    // 更新存储的状态
    audioStatus = {
      ...audioStatus,
      capturing: state.capturing ?? audioStatus.capturing,
      playing: state.playing ?? audioStatus.playing,
      error: state.error,
    }

    // 可以在这里广播状态到所有窗口
    // 例如: BrowserWindow.getAllWindows().forEach(win => win.webContents.send('audio:state-changed', state))
  })

  console.log('[BackgroundAudioIpc] 后台音频 IPC 通道已注册')
}
