import { join } from 'node:path'
import process from 'node:process'
import { is } from '@electron-toolkit/utils'
import { BrowserWindow } from 'electron'

import { getLogger } from '../../utils/logger'

const logger = getLogger('BackgroundAudioWindow')

/**
 * 创建后台音频窗口
 * 专门用于处理音频采集和播放,不显示UI
 * 保持系统AEC永久活跃,不受UI窗口切换影响
 */
export function buildBackgroundAudioWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1,
    height: 1,
    show: false, // 永远不显示
    skipTaskbar: true, // 不在任务栏显示
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false, // 需要访问 Node.js API
      contextIsolation: true,
      webSecurity: false, // 禁用 Web 安全以允许 getUserMedia
      nodeIntegration: false,
      backgroundThrottling: false, // 禁用后台节流，保持音频处理性能
    },
  })

  // 加载音频处理页面
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/audio.html`)
  }
  else {
    window.loadFile(join(__dirname, '../renderer/audio.html'))
  }

  // 授予媒体权限（麦克风和摄像头）
  window.webContents.session.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowedPermissions = ['media', 'microphone', 'audioCapture', 'mediaDevices']
    if (allowedPermissions.includes(permission)) {
      callback(true) // 允许
    }
    else {
      callback(false) // 拒绝
    }
  })

  // 开发模式下可以打开DevTools调试
  if (is.dev) {
    window.webContents.openDevTools({ mode: 'detach' })
  }

  logger.info('后台音频窗口已创建')

  return window
}
