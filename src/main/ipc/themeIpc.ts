/**
 * 主题相关的 IPC 处理器
 */
import { BrowserWindow, ipcMain } from 'electron'

import { createLogger } from '../utils/logger'

const logger = createLogger('ThemeIpc')

/**
 * 当前主题存储
 * 由于渲染进程使用 localStorage 存储，主进程这里只做转发
 */
let currentTheme: 'light' | 'dark' | 'auto' = 'auto'

/**
 * 注册主题相关的 IPC 处理器
 */
export function registerThemeIpc(): void {
  /**
   * 获取当前主题
   */
  ipcMain.handle('theme:get', async () => {
    // 尝试从主窗口获取实际主题
    const mainWindow = BrowserWindow.getAllWindows()[0]
    if (mainWindow) {
      try {
        const result = await mainWindow.webContents.executeJavaScript(
          `(function() {
            try {
              return localStorage.getItem('vueuse-color-scheme') || 'auto';
            } catch (e) {
              return 'auto';
            }
          })()`,
        )
        currentTheme = result as 'light' | 'dark' | 'auto'
        return currentTheme
      }
      catch (error) {
        logger.error('获取主题失败', error)
        return currentTheme
      }
    }
    return currentTheme
  })

  logger.info('主题 IPC 处理器已注册')
}

/**
 * 广播主题变更到所有窗口
 * @param theme - 主题模式
 */
export function broadcastThemeChange(theme: 'light' | 'dark' | 'auto'): void {
  currentTheme = theme
  const windows = BrowserWindow.getAllWindows()

  for (const win of windows) {
    win.webContents.send('theme:set', theme)
  }

  logger.info(`已广播主题变更: ${theme}`)
}
