import type { IpcContext } from '../types/ipc'
import { ipcMain } from 'electron'
import { registerWakeWordIpc } from './wakeWordIpc'

/**
 * 注册 Application 控制相关的 IPC 通道
 * @param context - IPC 上下文，包含依赖实例
 */
export function registerAppIpc(context: IpcContext): void {
  const { application } = context
  console.log('[App IPC] 注册 Application 控制 IPC 通道...')

  // 注册唤醒词 IPC
  registerWakeWordIpc(context)

  // 开始手动监听
  ipcMain.handle('app:start-listening-manual', async () => {
    try {
      await application.startListeningManual()
      return { success: true }
    }
    catch (error) {
      console.error('[App IPC] 开始手动监听失败:', error)
      return { success: false, error: String(error) }
    }
  })

  // 停止手动监听
  ipcMain.handle('app:stop-listening-manual', async () => {
    try {
      await application.stopListeningManual()
      return { success: true }
    }
    catch (error) {
      console.error('[App IPC] 停止手动监听失败:', error)
      return { success: false, error: String(error) }
    }
  })

  // 开始自动对话
  ipcMain.handle('app:start-auto-conversation', async () => {
    try {
      await application.startAutoConversation()
      return { success: true }
    }
    catch (error) {
      console.error('[App IPC] 开始自动对话失败:', error)
      return { success: false, error: String(error) }
    }
  })

  // 停止自动对话
  ipcMain.handle('app:stop-auto-conversation', async () => {
    try {
      await application.stopAutoConversation()
      return { success: true }
    }
    catch (error) {
      console.error('[App IPC] 停止自动对话失败:', error)
      return { success: false, error: String(error) }
    }
  })

  // 获取状态快照
  ipcMain.handle('app:get-state', () => {
    try {
      return application.getStateSnapshot()
    }
    catch (error) {
      console.error('[App IPC] 获取状态快照失败:', error)
      return {
        device_state: 'idle',
        listening_mode: 'manual',
        keep_listening: false,
        audio_opened: false,
      }
    }
  })

  // 发送文本消息
  ipcMain.handle('app:send-text', async (_event, text: string) => {
    try {
      // 参数校验
      if (!text || typeof text !== 'string') {
        return { success: false, error: '文本内容不能为空' }
      }

      if (text.length > 500) {
        return { success: false, error: '文本内容不能超过 500 字符' }
      }

      await application.sendText(text)
      return { success: true }
    }
    catch (error) {
      console.error('[App IPC] 发送文本消息失败:', error)
      return { success: false, error: String(error) }
    }
  })

  console.log('[App IPC] Application 控制 IPC 通道已注册')
}
