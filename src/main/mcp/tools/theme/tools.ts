/**
 * 主题控制工具定义
 */

import { BrowserWindow } from 'electron'
import { getLogger } from '../../../utils/logger'
import { getMcpContext } from '../../McpContext'
import { PropertyList, PropertyType } from '../../types'
import { defineTool } from '../registry'

const logger = getLogger('ThemeTools')

/**
 * 获取主窗口
 * 通过查找 URL 中包含 index.html 的可见窗口来确定主窗口
 */
function getMainWindow(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows()

  // 优先找 URL 中包含 index.html 的窗口（主窗口）
  for (const win of windows) {
    const url = win.webContents.getURL()
    if (url.includes('index.html') && !win.isDestroyed()) {
      return win
    }
  }

  // 退而求其次：找可见且非最小化的窗口
  for (const win of windows) {
    if (win.isVisible() && !win.isMinimized() && !win.isDestroyed()) {
      return win
    }
  }

  // 最后返回第一个未销毁的窗口
  for (const win of windows) {
    if (!win.isDestroyed()) {
      return win
    }
  }

  return null
}

/**
 * 设置主题
 */
defineTool({
  name: 'self.ui.set_theme',
  description: `Set the application theme (light/dark/auto). Changes the visual appearance across all windows.

Use this tool when:
1. User wants to change the theme or appearance
2. User says "切换深色模式", "switch to dark mode", "使用浅色主题"
3. User asks to enable/disable dark mode
4. User wants the theme to follow system preferences

Parameters:
- theme: Theme mode to set
  - "light": Light theme (浅色)
  - "dark": Dark theme (深色)
  - "auto": Follow system preferences (跟随系统)

Examples:
- "切换到深色模式" -> theme="dark"
- "使用浅色主题" -> theme="light"
- "跟随系统设置" -> theme="auto"
- "Turn on dark mode" -> theme="dark"`,
  properties: new PropertyList([
    {
      name: 'theme',
      type: PropertyType.STRING,
    },
  ]),
  callback: async (args: Record<string, unknown>): Promise<string> => {
    try {
      const theme = args.theme as string

      if (!['light', 'dark', 'auto'].includes(theme)) {
        logger.warn(`无效的主题值: ${theme}`)
        return JSON.stringify({
          success: false,
          message: `Invalid theme value: ${theme}. Must be 'light', 'dark', or 'auto'`,
        })
      }

      logger.info(`设置主题为: ${theme}`)

      const mcpContext = getMcpContext()
      mcpContext.broadcastTheme(theme as 'light' | 'dark' | 'auto')

      logger.info(`主题设置成功: ${theme}`)
      return JSON.stringify({
        success: true,
        theme,
        message: `Theme set to ${theme}`,
      })
    }
    catch (error) {
      logger.error('设置主题失败:', error)
      return JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : '设置主题失败',
      })
    }
  },
})

/**
 * 获取当前主题
 */
defineTool({
  name: 'self.ui.get_theme',
  description: `Get the current theme setting of the application.

Use when:
- User asks about current theme
- Need to check theme before toggling
- User says "当前是什么主题?", "what theme is active?"

Returns:
- String indicating current theme: "light", "dark", or "auto"`,
  properties: new PropertyList([]),
  callback: async (_args: Record<string, unknown>): Promise<string> => {
    try {
      logger.info('获取当前主题')

      const mainWindow = getMainWindow()

      if (!mainWindow) {
        return JSON.stringify({
          success: false,
          message: 'No windows available',
        })
      }

      const result = await mainWindow.webContents.executeJavaScript(
        `(function() {
          try {
            const mode = localStorage.getItem('vueuse-color-scheme') || 'auto';
            return { success: true, theme: mode };
          } catch (e) {
            return { success: false, message: e.message };
          }
        })()`,
      )

      logger.info('当前主题:', result)
      return JSON.stringify(result)
    }
    catch (error) {
      logger.error('获取主题失败:', error)
      return JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : '获取主题失败',
      })
    }
  },
})
