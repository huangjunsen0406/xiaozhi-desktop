/**
 * 桌面快捷菜单共享动作（Mini Hover / Live2D / Pets）
 */

export interface DesktopQuickActionItem {
  id: 'main' | 'settings'
  label: string
  run: () => void
}

/** 主界面：关闭 hover 菜单并切到主窗 */
export function goMainInterface(): void {
  window.api.hideHover?.()
  window.api.toggleToMain()
}

/** 设置：关闭 hover 菜单并打开设置 */
export function openSettings(): void {
  window.api.hideHover?.()
  window.api.toggleSettings()
}

/** 菜单项定义（标签 + 动作） */
export const DESKTOP_QUICK_MENU_ITEMS: ReadonlyArray<DesktopQuickActionItem> = [
  {
    id: 'main',
    label: '主界面',
    run: goMainInterface,
  },
  {
    id: 'settings',
    label: '设置',
    run: openSettings,
  },
]
