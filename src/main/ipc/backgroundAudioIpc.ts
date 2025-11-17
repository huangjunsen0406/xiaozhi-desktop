import { ipcMain } from 'electron'
import { getBackgroundAudioWindow } from '../windows/windowManager'

/**
 * 注册后台音频窗口的 IPC 通道
 * 提供对后台音频窗口的控制接口
 */
export function registerBackgroundAudioIpc(): void {
  /**
   * 向后台音频窗口发送命令
   */
  function sendAudioCommand(command: string, data?: any): void {
    const audioWindow = getBackgroundAudioWindow()
    if (audioWindow && !audioWindow.isDestroyed()) {
      audioWindow.webContents.send('audio:command', command, data)
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
   * 接收来自后台音频窗口的状态更新
   */
  ipcMain.on('audio:state', (_, state) => {
    console.log('[BackgroundAudioIpc] 收到音频状态更新:', state)
    // 可以在这里广播状态到所有窗口
    // 例如: BrowserWindow.getAllWindows().forEach(win => win.webContents.send('audio:state-changed', state))
  })

  console.log('[BackgroundAudioIpc] 后台音频 IPC 通道已注册')
}
