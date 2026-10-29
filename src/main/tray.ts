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

export function registerTray(): void {
  if (tray)
    return

  const image = buildTrayImage()
  tray = new Tray(image)
  tray.setToolTip('小智')

  tray.setContextMenu(buildDisplayModeMenu(true))

  onDisplayModeChange(() => {
    if (tray) {
      tray.setContextMenu(buildDisplayModeMenu(true))
    }
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
