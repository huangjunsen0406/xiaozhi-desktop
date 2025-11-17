import { ipcMain } from 'electron'
import { getApplication } from '../services/Application'

/**
 * 注册 Application 控制相关的 IPC 通道
 */
export function registerAppIpc(): void {
  console.log('[App IPC] 注册 Application 控制 IPC 通道...')

  // 开始手动监听
  ipcMain.handle('app:start-listening-manual', async () => {
    const app = getApplication()
    await app.startListeningManual()
  })

  // 停止手动监听
  ipcMain.handle('app:stop-listening-manual', async () => {
    const app = getApplication()
    await app.stopListeningManual()
  })

  // 开始自动对话
  ipcMain.handle('app:start-auto-conversation', async () => {
    const app = getApplication()
    await app.startAutoConversation()
  })

  // 停止自动对话
  ipcMain.handle('app:stop-auto-conversation', async () => {
    const app = getApplication()
    await app.stopAutoConversation()
  })

  // 获取状态快照
  ipcMain.handle('app:get-state', () => {
    const app = getApplication()
    return app.getStateSnapshot()
  })

  // 发送文本消息
  ipcMain.handle('app:send-text', async (_event, text: string) => {
    const app = getApplication()
    await app.sendText(text)
  })

  console.log('[App IPC] Application 控制 IPC 通道已注册')
}
