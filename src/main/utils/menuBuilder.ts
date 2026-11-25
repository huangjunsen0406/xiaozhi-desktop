import type { MenuItemConstructorOptions } from 'electron'
import process from 'node:process'
import { app, Menu } from 'electron'
import { getCurrentDisplayMode, restoreCurrentModeWindow, toggleSettings, toggleToChat, toggleToLive2d, toggleToMain, toggleToMini, toggleToPets } from '../windows/windowManager'

export function buildAppMenu(): Menu {
  const appName = app.getName()
  const isMac = process.platform === 'darwin'

  const template: MenuItemConstructorOptions[] = [
    {
      label: isMac ? appName : '应用',
      submenu: [
        {
          label: '设置…',
          accelerator: 'CmdOrCtrl+,',
          click: () => toggleSettings(),
        },
        { type: 'separator' },
        { role: 'quit', label: `退出 ${appName}` },
      ],
    },
    {
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
    },
  ]

  return Menu.buildFromTemplate(template)
}

export function buildDisplayModeMenu(includeQuit: boolean = false): Menu {
  const currentMode = getCurrentDisplayMode()

  const menuTemplate: MenuItemConstructorOptions[] = [
    {
      label: '显示窗口',
      click: restoreCurrentModeWindow,
    },
    { type: 'separator' },
    {
      label: '显示模式',
      submenu: [
        { label: '标准窗口', type: 'radio', checked: currentMode === 'main', click: () => toggleToMain() },
        { label: '迷你悬浮球', type: 'radio', checked: currentMode === 'mini', click: () => toggleToMini() },
        { label: '聊天视图', type: 'radio', checked: currentMode === 'chat', click: () => toggleToChat() },
        { label: 'Live2D 桌面宠物', type: 'radio', checked: currentMode === 'live2d', click: () => toggleToLive2d() },
        { label: '精灵宠物', type: 'radio', checked: currentMode === 'pets', click: () => toggleToPets() },
      ],
    },
    { type: 'separator' },
    {
      label: '设置',
      click: () => toggleSettings(),
    },
  ]

  if (includeQuit) {
    menuTemplate.push(
      { type: 'separator' },
      { label: '退出', click: () => app.quit() },
    )
  }

  return Menu.buildFromTemplate(menuTemplate)
}
