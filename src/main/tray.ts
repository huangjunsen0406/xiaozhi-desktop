import { join } from 'node:path'
import process from 'node:process'
import { app, Menu, nativeImage, nativeTheme, screen, Tray } from 'electron'
import linux24 from '../../resources/tray/icon-24.png?asset'
import linux32 from '../../resources/tray/icon-32.png?asset'
import winIco from '../../resources/tray/icon.ico?asset'
import macTpl2x from '../../resources/tray/iconTemplate@2x.png?asset'
import { getCurrentDisplayMode, onDisplayModeChange, toggleSettings, toggleToChat, toggleToLive2d, toggleToMain, toggleToMini } from './windows/windowManager'

let tray: Tray | null = null
let lastLinuxBucket: 24 | 32 | null = null

function resolveFallback(relative: string) {
  const base = app.isPackaged ? process.resourcesPath : app.getAppPath()
  return join(base, 'resources', 'tray', relative)
}

function pickLinuxBucket(): 24 | 32 {
  const scale = screen.getPrimaryDisplay().scaleFactor || 1
  return scale > 1.5 ? 32 : 24
}

function buildTrayImage(): Electron.NativeImage {
  let img: Electron.NativeImage

  if (process.platform === 'darwin') {
    const candidate = (macTpl2x as unknown as string) || resolveFallback('iconTemplate@2x.png')
    img = nativeImage.createFromPath(candidate)
    if (img.isEmpty())
      img = nativeImage.createFromPath(resolveFallback('iconTemplate@2x.png'))
    img.setTemplateImage(true)
    return img
  }

  if (process.platform === 'win32') {
    const candidate = (winIco as unknown as string) || resolveFallback('icon.ico')
    img = nativeImage.createFromPath(candidate)
    if (img.isEmpty())
      img = nativeImage.createFromPath(resolveFallback('icon.ico'))
    return img
  }

  const bucket = pickLinuxBucket()
  lastLinuxBucket = bucket

  const fromVite
    = bucket === 32 ? (linux32 as unknown as string) : (linux24 as unknown as string)

  const candidate = (fromVite as string) || resolveFallback(bucket === 32 ? 'icon-32.png' : 'icon-24.png')
  img = nativeImage.createFromPath(candidate)
  if (img.isEmpty()) {
    img = nativeImage.createFromPath(resolveFallback(bucket === 32 ? 'icon-32.png' : 'icon-24.png'))
  }
  return img
}

/**
 * 构建托盘菜单
 */
function buildTrayMenu(): Menu {
  const currentMode = getCurrentDisplayMode()

  return Menu.buildFromTemplate([
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
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ])
}

/**
 * 更新托盘菜单（当显示模式变化时调用）
 */
function updateTrayMenu(): void {
  if (!tray)
    return
  tray.setContextMenu(buildTrayMenu())
}

export function registerTray(): void {
  if (tray)
    return

  const image = buildTrayImage()
  tray = new Tray(image)
  tray.setToolTip('小智')

  tray.setContextMenu(buildTrayMenu())

  onDisplayModeChange(() => {
    updateTrayMenu()
  })

  if (process.platform === 'darwin') {
    tray.on('click', () => tray?.popUpContextMenu())
  }
  else {
    tray.on('right-click', () => tray?.popUpContextMenu())
  }

  screen.on('display-metrics-changed', () => {
    if (!tray)
      return
    if (process.platform === 'linux') {
      const bucket = pickLinuxBucket()
      if (bucket !== lastLinuxBucket) {
        lastLinuxBucket = bucket
        tray.setImage(buildTrayImage())
      }
    }
  })

  nativeTheme.on('updated', () => {
    if (!tray)
      return
    if (process.platform === 'darwin') {
      tray.setImage(buildTrayImage())
    }
  })
}
