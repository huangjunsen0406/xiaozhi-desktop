import type { IpcMainInvokeEvent } from 'electron'
import type { Application } from '../services/Application'
import { ipcMain } from 'electron'

export function registerShortcutIpcChannels(application: Application) {
  const shortcutManager = application.getShortcutManager()

  if (!shortcutManager) {
    console.warn('[ShortcutIPC] ShortcutManager 未初始化')
    return
  }

  // 获取所有快捷键
  ipcMain.handle('shortcut:get-all', async () => {
    return await shortcutManager.loadShortcuts()
  })

  // 更新快捷键
  ipcMain.handle('shortcut:update', async (_event: IpcMainInvokeEvent, action: string, accelerator: string | null) => {
    await shortcutManager.updateShortcut(action, accelerator)
    return { success: true }
  })

  // 检测冲突
  ipcMain.handle('shortcut:check-conflict', async (_event: IpcMainInvokeEvent, accelerator: string, excludeAction?: string) => {
    const conflictName = shortcutManager.checkConflict(accelerator, excludeAction)
    return { conflict: !!conflictName, name: conflictName }
  })

  // 重置为默认
  ipcMain.handle('shortcut:reset', async () => {
    await shortcutManager.resetToDefaults()
    return { success: true }
  })

  console.log('[ShortcutIPC] 快捷键 IPC 通道已注册')
}
