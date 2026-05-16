import type { ShortcutConfig } from '@shared/types'
import type { ServiceContainer } from '../core/ServiceContainer'
import type { DbShortcutConfig } from '../types/database'
import type { DatabaseManager } from './database'
import { globalShortcut } from 'electron'
import { getLogger } from '../utils/logger'
import {
  ensureMainWindow,
  getCurrentModeWindow,
  toggleSettings,
  toggleToChat,
  toggleToLive2d,
  toggleToMain,
  toggleToMini,
} from '../windows/windowManager'

/**
 * 将数据库快捷键记录转为共享类型
 */
function dbToShortcutConfig(row: DbShortcutConfig): ShortcutConfig {
  return {
    id: row.id,
    action: row.action,
    name: row.name,
    category: row.category,
    accelerator: row.accelerator,
    enabled: Boolean(row.enabled),
    isGlobal: Boolean(row.is_global),
  }
}

export class ShortcutManager {
  private db: DatabaseManager
  private container: ServiceContainer
  private shortcuts: Map<string, ShortcutConfig> = new Map()
  private logger = getLogger('ShortcutManager')

  constructor(db: DatabaseManager, container: ServiceContainer) {
    this.db = db
    this.container = container
    this.initDatabase()
  }

  private initDatabase(): void {
    if (this.db.isShortcutsEmpty()) {
      this.db.insertDefaultShortcuts()
    }
  }

  async loadShortcuts(): Promise<ShortcutConfig[]> {
    const dbShortcuts = this.db.getShortcuts()
    const shortcuts = dbShortcuts.map(dbToShortcutConfig)
    this.shortcuts.clear()
    shortcuts.forEach(s => this.shortcuts.set(s.action, s))
    return shortcuts
  }

  async registerAll(): Promise<void> {
    await this.loadShortcuts()

    for (const [action, config] of this.shortcuts) {
      if (config.enabled && config.isGlobal && config.accelerator) {
        this.registerShortcut(action, config.accelerator)
      }
    }

    this.logger.info('已注册快捷键数量:', this.shortcuts.size)
  }

  registerShortcut(action: string, accelerator: string): void {
    try {
      const success = globalShortcut.register(accelerator, () => {
        this.executeAction(action)
      })

      if (success) {
        this.logger.info(`注册成功: ${action} -> ${accelerator}`)
      }
      else {
        this.logger.warn(`注册失败（可能被占用）: ${accelerator}`)
      }
    }
    catch (error) {
      this.logger.error(`注册异常: ${accelerator}`, error)
    }
  }

  unregisterShortcut(accelerator: string): void {
    globalShortcut.unregister(accelerator)
    this.logger.info(`注销快捷键: ${accelerator}`)
  }

  async updateShortcut(action: string, newAccelerator: string | null): Promise<void> {
    const oldConfig = this.shortcuts.get(action)

    if (oldConfig?.accelerator) {
      this.unregisterShortcut(oldConfig.accelerator)
    }

    this.db.updateShortcut(action, newAccelerator)

    if (newAccelerator) {
      this.registerShortcut(action, newAccelerator)
    }

    await this.loadShortcuts()
  }

  checkConflict(accelerator: string, excludeAction?: string): string | null {
    for (const [action, config] of this.shortcuts) {
      if (action !== excludeAction && config.accelerator === accelerator && config.enabled) {
        return config.name
      }
    }
    return null
  }

  async resetToDefaults(): Promise<void> {
    globalShortcut.unregisterAll()
    this.db.deleteAllShortcuts()
    this.db.insertDefaultShortcuts()
    await this.registerAll()
  }

  private executeAction(action: string): void {
    this.logger.info(`执行操作: ${action}`)

    switch (action) {
      case 'settings.toggle':
        toggleSettings()
        break

      case 'window.main':
        toggleToMain()
        break

      case 'window.mini':
        toggleToMini()
        break

      case 'window.chat':
        toggleToChat()
        break

      case 'window.live2d':
        toggleToLive2d()
        break

      case 'conversation.manual': {
        const state = this.container.getStateSnapshot()
        if (state.deviceState === 'idle') {
          this.container.startListeningManual()
        }
        else if (state.deviceState === 'listening' && state.listeningMode === 'manual') {
          this.container.stopListeningManual()
        }
        break
      }

      case 'conversation.auto': {
        const autoState = this.container.getStateSnapshot()
        if (autoState.channelOpen) {
          this.container.stopAutoConversation()
        }
        else {
          this.container.startAutoConversation()
        }
        break
      }

      case 'conversation.interrupt':
        this.container.interruptSpeaking()
        break

      case 'app.activate': {
        // 显示当前显示模式对应的窗口（与 Dock 图标行为一致）
        const targetWindow = getCurrentModeWindow()

        if (targetWindow && !targetWindow.isDestroyed()) {
          if (!targetWindow.isVisible()) {
            targetWindow.show()
          }
          targetWindow.focus()
        }
        else {
          // 如果当前模式的窗口不存在，创建主窗口
          const mainWin = ensureMainWindow()
          mainWin.show()
          mainWin.focus()
        }
        break
      }

      default:
        this.logger.warn(`未知操作: ${action}`)
    }
  }

  destroy(): void {
    globalShortcut.unregisterAll()
  }
}
