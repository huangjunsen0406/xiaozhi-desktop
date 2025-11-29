import { join } from 'node:path'
import process from 'node:process'
import { is } from '@electron-toolkit/utils'
import { BrowserWindow } from 'electron'

/**
 * 创建悬浮窗实例
 *
 * 配置说明：
 * - 尺寸：260x150 像素，固定大小不可调整
 * - 外观：无边框、透明背景、带阴影
 * - 行为：始终置顶、所有工作区可见、不出现在任务栏和调度中心
 * - 平台：macOS 使用 panel 类型，其他平台使用默认类型
 * - 预加载：启用预加载脚本，禁用沙箱模式
 *
 * @returns BrowserWindow 配置好的悬浮窗实例
 */
export function buildHoverWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 260,
    height: 150,
    show: false, // 初始隐藏
    frame: false, // 无边框
    transparent: true, // 透明窗口
    backgroundColor: '#00000000', // 透明背景色
    hasShadow: true, // 显示阴影
    resizable: false, // 不可调整大小
    movable: false, // 不可移动
    fullscreenable: false, // 不可全屏
    hiddenInMissionControl: true, // 在调度中心隐藏
    skipTaskbar: true, // 不显示在任务栏
    type: process.platform === 'darwin' ? 'panel' : undefined, // macOS 使用 panel 类型
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false, // 禁用沙箱以允许 Node.js API 访问
    },
  })

  // 设置窗口始终置顶，级别为 status（状态栏级别）
  win.setAlwaysOnTop(true, 'status')
  // 在所有工作区可见，包括全屏模式
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  // 从窗口菜单中排除
  win.excludedFromShownWindowsMenu = true

  // 根据环境加载页面
  if (is.dev && process.env.ELECTRON_RENDERER_URL)
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/hover`)
  else
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'hover' })

  return win
}
