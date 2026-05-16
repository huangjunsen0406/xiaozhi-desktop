import type { MenuItemConstructorOptions } from 'electron'
import process from 'node:process'
import { app, Menu } from 'electron'
import { getCurrentDisplayMode, toggleSettings, toggleToChat, toggleToLive2d, toggleToMain, toggleToMini, toggleToPets } from '../windows/windowManager'
/**
 * 构建应用菜单（包含 Edit 菜单以支持复制粘贴等操作）
 */
export function buildAppMenu(): Menu {
  const appName = app.getName()
  const isMac = process.platform === 'darwin'

  const template: MenuItemConstructorOptions[] = []

  // macOS 应用菜单
  if (isMac) {
    const appSubmenu: MenuItemConstructorOptions[] = [
      {
        label: '设置…',
        accelerator: 'CmdOrCtrl+,',
        click: () => {
          toggleSettings()
        },
      },
      { type: 'separator' },
      { role: 'quit', label: `退出 ${appName}` },
    ]

    template.push({
      label: appName,
      submenu: appSubmenu,
    })
  }
  else {
    // Windows/Linux 应用菜单
    const appSubmenu: MenuItemConstructorOptions[] = [
      {
        label: '设置…',
        accelerator: 'CmdOrCtrl+,',
        click: () => {
          toggleSettings()
        },
      },
      { type: 'separator' },
      { role: 'quit', label: `退出 ${appName}` },
    ]

    template.push({
      label: '应用',
      submenu: appSubmenu,
    })
  }

  // Edit 菜单 - 支持复制粘贴等操作
  template.push({
    label: '编辑',
    submenu: [
      { role: 'undo', label: '撤销' },
      { role: 'redo', label: '重做' },
      { type: 'separator' },
      { role: 'cut', label: '剪切' },
      { role: 'copy', label: '复制' },
      { role: 'paste', label: '粘贴' },
      { role: 'selectAll', label: '全选' },
    ],
  })

  return Menu.buildFromTemplate(template)
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
        {
          label: '精灵宠物',
          type: 'radio',
          checked: currentMode === 'pets',
          click: () => {
            toggleToPets()
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
