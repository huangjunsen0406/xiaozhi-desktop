/**
 * 剪贴板 IPC 处理器
 */
import { clipboard, ipcMain } from 'electron'
import { getLogger } from '../utils/logger'

const logger = getLogger('ClipboardIpc')

/**
 * 注册剪贴板相关的 IPC 通道
 */
export function registerClipboardIpcChannels(): void {
  // 写入文本到剪贴板
  ipcMain.handle('clipboard:writeText', async (_event, text: string) => {
    try {
      clipboard.writeText(text)
      logger.info('文本已复制到剪贴板')
    }
    catch (error) {
      logger.error('复制到剪贴板失败', error)
      throw error
    }
  })

  // 从剪贴板读取文本
  ipcMain.handle('clipboard:readText', async () => {
    try {
      const text = clipboard.readText()
      return text
    }
    catch (error) {
      logger.error('从剪贴板读取失败', error)
      throw error
    }
  })

  logger.info('剪贴板 IPC 通道已注册')
}
