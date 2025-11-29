import type { ShortcutConfig } from '@shared/types'
import type { Application } from './Application'
import Database from 'better-sqlite3'
import { globalShortcut } from 'electron'
import {
  ensureMainWindow,
  toggleSettings,
  toggleToChat,
  toggleToMain,
  toggleToMini,
} from '../windows/windowManager'

export class ShortcutManager {
  private db: Database.Database
  private application: Application
  private shortcuts: Map<string, ShortcutConfig> = new Map()

  constructor(dbPath: string, application: Application) {
    this.db = new Database(dbPath)
    this.application = application
    this.initDatabase()
  }

  private initDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS shortcuts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        accelerator TEXT,
        enabled INTEGER DEFAULT 1,
        is_global INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)

    const count = this.db.prepare('SELECT COUNT(*) as count FROM shortcuts').get() as { count: number }
    if (count.count === 0) {
      this.insertDefaultShortcuts()
    }
  }

  private insertDefaultShortcuts(): void {
    const defaults = [
      { action: 'settings.toggle', name: '打开设置', category: 'window', accelerator: 'CommandOrControl+,' },
      { action: 'window.main', name: '标准窗口', category: 'window', accelerator: 'CommandOrControl+1' },
      { action: 'window.mini', name: '迷你悬浮球', category: 'window', accelerator: 'CommandOrControl+2' },
      { action: 'window.chat', name: '聊天视图', category: 'window', accelerator: 'CommandOrControl+3' },
      { action: 'conversation.manual', name: '手动监听', category: 'conversation', accelerator: 'CommandOrControl+M' },
      { action: 'conversation.auto', name: '自动对话', category: 'conversation', accelerator: 'CommandOrControl+Shift+M' },
      { action: 'conversation.interrupt', name: '打断对话', category: 'conversation', accelerator: 'CommandOrControl+.' },
      { action: 'app.activate', name: '唤起应用', category: 'quick', accelerator: 'CommandOrControl+Shift+X' },
    ]

    const stmt = this.db.prepare(`
      INSERT INTO shortcuts (action, name, category, accelerator, enabled, is_global, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, 1, ?, ?)
    `)

    const now = Math.floor(Date.now() / 1000)
    for (const shortcut of defaults) {
      stmt.run(shortcut.action, shortcut.name, shortcut.category, shortcut.accelerator, now, now)
    }

    console.log('[ShortcutManager] 已插入默认快捷键')
  }

  async loadShortcuts(): Promise<ShortcutConfig[]> {
    const shortcuts = this.db.prepare('SELECT * FROM shortcuts').all() as ShortcutConfig[]
    this.shortcuts.clear()
    shortcuts.forEach(s => this.shortcuts.set(s.action, s))
    return shortcuts
  }

  async registerAll(): Promise<void> {
    await this.loadShortcuts()

    for (const [action, config] of this.shortcuts) {
      if (config.enabled && config.is_global && config.accelerator) {
        this.registerShortcut(action, config.accelerator)
      }
    }

    console.log('[ShortcutManager] 已注册快捷键数量:', this.shortcuts.size)
  }

  registerShortcut(action: string, accelerator: string): void {
    try {
      const success = globalShortcut.register(accelerator, () => {
        this.executeAction(action)
      })

      if (success) {
        console.log(`[ShortcutManager] 注册成功: ${action} -> ${accelerator}`)
      }
      else {
        console.warn(`[ShortcutManager] 注册失败（可能被占用）: ${accelerator}`)
      }
    }
    catch (error) {
      console.error(`[ShortcutManager] 注册异常: ${accelerator}`, error)
    }
  }

  unregisterShortcut(accelerator: string): void {
    globalShortcut.unregister(accelerator)
    console.log(`[ShortcutManager] 注销快捷键: ${accelerator}`)
  }

  async updateShortcut(action: string, newAccelerator: string | null): Promise<void> {
    const oldConfig = this.shortcuts.get(action)

    if (oldConfig?.accelerator) {
      this.unregisterShortcut(oldConfig.accelerator)
    }

    const now = Math.floor(Date.now() / 1000)
    this.db.prepare('UPDATE shortcuts SET accelerator = ?, updated_at = ? WHERE action = ?')
      .run(newAccelerator, now, action)

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
    this.db.prepare('DELETE FROM shortcuts').run()
    this.insertDefaultShortcuts()
    await this.registerAll()
  }

  private executeAction(action: string): void {
    console.log(`[ShortcutManager] 执行操作: ${action}`)

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

      case 'conversation.manual': {
        const state = this.application.getState()
        if (state.deviceState === 'idle') {
          this.application.startListeningManual()
        }
        else if (state.deviceState === 'listening' && state.listeningMode === 'manual') {
          this.application.stopListeningManual()
        }
        break
      }

      case 'conversation.auto': {
        const autoState = this.application.getState()
        if (autoState.channelOpen) {
          this.application.stopAutoConversation()
        }
        else {
          this.application.startAutoConversation()
        }
        break
      }

      case 'conversation.interrupt':
        this.application.interruptSpeaking()
        break

      case 'app.activate': {
        const mainWin = ensureMainWindow()
        mainWin.show()
        mainWin.focus()
        break
      }

      default:
        console.warn(`[ShortcutManager] 未知操作: ${action}`)
    }
  }

  destroy(): void {
    globalShortcut.unregisterAll()
    this.db.close()
  }
}
