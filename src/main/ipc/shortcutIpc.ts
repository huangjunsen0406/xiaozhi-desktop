import type { ServiceContainer } from '../core/ServiceContainer'
import { getLogger } from '../utils/logger'
import { createIpcHandler, success } from './middleware'

const logger = getLogger('ShortcutIpc')

export function registerShortcutIpcChannels(container: ServiceContainer) {
  const shortcutManager = container.getShortcutManager()

  if (!shortcutManager) {
    logger.warn('ShortcutManager 未初始化')
    return
  }

  createIpcHandler({
    channel: 'shortcut:get-all',
    handler: async () => {
      return success(await shortcutManager.loadShortcuts())
    },
  })

  createIpcHandler({
    channel: 'shortcut:update',
    schema: {
      action: { type: 'string', required: true, minLength: 1 },
    },
    handler: async (_event, action: unknown, accelerator: unknown) => {
      const accel = accelerator === null || accelerator === undefined
        ? null
        : String(accelerator)
      await shortcutManager.updateShortcut(String(action), accel)
      return success()
    },
  })

  createIpcHandler({
    channel: 'shortcut:check-conflict',
    schema: {
      accelerator: { type: 'string', required: true, minLength: 1 },
    },
    handler: async (_event, accelerator: unknown, excludeAction: unknown) => {
      const exclude = typeof excludeAction === 'string' ? excludeAction : undefined
      const conflictName = shortcutManager.checkConflict(String(accelerator), exclude)
      return success({ conflict: !!conflictName, name: conflictName })
    },
  })

  createIpcHandler({
    channel: 'shortcut:reset',
    handler: async () => {
      await shortcutManager.resetToDefaults()
      return success()
    },
  })

  logger.info('快捷键 IPC 通道已注册')
}
