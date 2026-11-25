import { join } from 'node:path'
import process from 'node:process'
import { app, nativeImage, nativeTheme, screen, Tray } from 'electron'
import linux24 from '../../resources/tray/icon-24.png?asset'
import linux32 from '../../resources/tray/icon-32.png?asset'
import winIco from '../../resources/tray/icon.ico?asset'
import macTpl2x from '../../resources/tray/iconTemplate@2x.png?asset'
import { buildDisplayModeMenu } from './utils/menuBuilder'
import { onDisplayModeChange, restoreCurrentModeWindow } from './windows/windowManager'

let tray: Tray | null = null
let lastLinuxBucket: 24 | 32 | null = null

function resolveFallback(relative: string): string {
  const base = app.isPackaged ? process.resourcesPath : app.getAppPath()
  return join(base, 'resources', 'tray', relative)
}

function loadTrayIcon(asset: unknown, fallbackName: string): Electron.NativeImage {
  const fallback = resolveFallback(fallbackName)
  const img = nativeImage.createFromPath((asset as string) || fallback)
  return img.isEmpty() ? nativeImage.createFromPath(fallback) : img
}

function pickLinuxBucket(): 24 | 32 {
  const scale = screen.getPrimaryDisplay().scaleFactor || 1
  return scale > 1.5 ? 32 : 24
}

function buildTrayImage(): Electron.NativeImage {
  if (process.platform === 'darwin') {
    const img = loadTrayIcon(macTpl2x, 'iconTemplate@2x.png')
    img.setTemplateImage(true)
    return img
  }
  if (process.platform === 'win32') {
    return loadTrayIcon(winIco, 'icon.ico')
  }

  const bucket = pickLinuxBucket()
  lastLinuxBucket = bucket
  return bucket === 32
    ? loadTrayIcon(linux32, 'icon-32.png')
    : loadTrayIcon(linux24, 'icon-24.png')
}

export function registerTray(): void {
  if (tray)
    return

  tray = new Tray(buildTrayImage())
  tray.setToolTip('小智')
  tray.setContextMenu(buildDisplayModeMenu(true))

  onDisplayModeChange(() => {
    tray?.setContextMenu(buildDisplayModeMenu(true))
  })

  if (process.platform === 'darwin') {
    tray.on('click', () => tray?.popUpContextMenu())
  }
  else if (process.platform === 'win32') {
    tray.on('double-click', restoreCurrentModeWindow)
    tray.on('right-click', () => tray?.popUpContextMenu())
  }
  else {
    // Linux click 表示桌面环境的 activation，可能由单击或双击触发。
    tray.on('click', restoreCurrentModeWindow)
  }

  screen.on('display-metrics-changed', () => {
    if (!tray || process.platform !== 'linux')
      return
    const bucket = pickLinuxBucket()
    if (bucket !== lastLinuxBucket) {
      lastLinuxBucket = bucket
      tray.setImage(buildTrayImage())
    }
  })

  nativeTheme.on('updated', () => {
    if (tray && process.platform === 'darwin') {
      tray.setImage(buildTrayImage())
    }
  })
}
