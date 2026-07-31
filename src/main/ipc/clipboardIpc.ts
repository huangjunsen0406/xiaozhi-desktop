/**
 * 剪贴板 IPC 处理器（createIpcHandler + IpcResult）
 */
import { clipboard } from 'electron'
import { getLogger } from '../utils/logger'
import { createIpcHandler, success } from './middleware'

const logger = getLogger('ClipboardIpc')

/**
 * 注册剪贴板相关的 IPC 通道
 */
export function registerClipboardIpcChannels(): void {
  createIpcHandler({
    channel: 'clipboard:write-text',
    schema: {
      text: { type: 'string', required: true },
    },
    handler: async (_event, text: unknown) => {
      clipboard.writeText(String(text))
      logger.info('文本已复制到剪贴板')
      return success()
    },
  })

  createIpcHandler({
    channel: 'clipboard:read-text',
    handler: async () => {
      const text = clipboard.readText()
      return success(text)
    },
  })

  logger.info('剪贴板 IPC 通道已注册')
}
