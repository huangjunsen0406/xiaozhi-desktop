import type { MenuItemConstructorOptions } from 'electron'
import { app, Menu } from 'electron'
import { getCurrentDisplayMode, toggleSettings, toggleToChat, toggleToLive2d, toggleToMain, toggleToMini } from '../windows/windowManager'

/**
 * 构建应用菜单（仅包含设置和退出）
 */
export function buildAppMenu(): Menu {
  const appName = app.getName()

  const submenu: MenuItemConstructorOptions[] = []

  submenu.push({
    label: '设置…',
    accelerator: 'CmdOrCtrl+,',
    click: () => {
      toggleSettings()
    },
  })

  submenu.push({ type: 'separator' })
  submenu.push({ role: 'quit', label: `退出 ${appName}` })

  return Menu.buildFromTemplate([
    {
      label: appName,
      submenu,
    },
  ])
}

/**
 * 构建显示模式菜单项
 * 用于 Dock 菜单和托盘菜单
 * @param includeQuit - 是否包含退出选项（托盘菜单需要，Dock 菜单不需要）
 * @returns Electron Menu 实例
 */
export function buildDisplayModeMenu(includeQuit: boolean = false): Menu {
  const currentMode = getCurrentDisplayMode()

  const menuTemplate: MenuItemConstructorOptions[] = [
    {
      label: '显示模式',
      submenu: [
        {
          label: '标准窗口',
          type: 'radio',
          checked: currentMode === 'main',
          click: () => {
            toggleToMain()
          },
        },
        {
          label: '迷你悬浮球',
          type: 'radio',
          checked: currentMode === 'mini',
          click: () => {
            toggleToMini()
          },
        },
        {
          label: '聊天视图',
          type: 'radio',
          checked: currentMode === 'chat',
          click: () => {
            toggleToChat()
          },
        },
        {
          label: 'Live2D 桌面宠物',
          type: 'radio',
          checked: currentMode === 'live2d',
          click: () => {
            toggleToLive2d()
          },
        },
      ],
    },
    { type: 'separator' },
    {
      label: '设置',
      click: () => {
        toggleSettings()
      },
    },
  ]

  // 托盘菜单需要退出选项
  if (includeQuit) {
    menuTemplate.push(
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          app.quit()
        },
      },
    )
  }

  return Menu.buildFromTemplate(menuTemplate)
}
