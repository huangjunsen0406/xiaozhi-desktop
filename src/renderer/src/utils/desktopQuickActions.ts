/**
 * 桌面快捷菜单共享动作（Mini Hover / Live2D / Pets）
 */

export interface DesktopQuickActionItem {
  id: 'main' | 'chat' | 'settings' | 'quit'
  label: string
  run: () => void
}

export function goMainInterface(): void {
  window.api.hideHover()
  window.api.toggleToMain()
}

export function goChatView(): void {
  window.api.hideHover()
  void window.api.switchDisplayMode('chat')
}

export function openSettings(): void {
  window.api.hideHover()
  window.api.toggleSettings()
}

export function quitApp(): void {
  window.api.hideHover()
  window.api.quitApp()
}

export const DESKTOP_QUICK_MENU_ITEMS: ReadonlyArray<DesktopQuickActionItem> = [
  { id: 'main', label: '主界面', run: goMainInterface },
  { id: 'chat', label: '聊天视图', run: goChatView },
  { id: 'settings', label: '设置', run: openSettings },
  { id: 'quit', label: '退出', run: quitApp },
]
