import type { NativeImage } from 'electron'
import { join } from 'node:path'
import process from 'node:process'
import { app, nativeImage } from 'electron'

/**
 * 获取应用图标
 * 统一处理各平台的图标资源
 * @returns 图标路径（Windows/Linux）或 NativeImage（macOS）
 */
export function getAppIcon(): string | NativeImage | undefined {
  if (process.platform === 'win32') {
    // Windows: 使用 icon.ico
    return join(__dirname, '../../resources/icon.ico')
  }
  else if (process.platform === 'linux') {
    // Linux: 使用 icon.png
    return nativeImage.createFromPath(join(__dirname, '../../resources/icon.png'))
  }
  else if (process.platform === 'darwin') {
    // macOS: 使用 app bundle 的图标
    // 获取应用的图标路径
    const appPath = app.getPath('exe')
    const iconPath = join(appPath, '..', 'Resources', 'icon.icns')

    try {
      const icon = nativeImage.createFromPath(iconPath)
      // 如果图标存在且不为空，返回
      if (!icon.isEmpty()) {
        return icon
      }
    }
    catch {
      // 忽略错误
    }

    // 备选方案：使用 PNG 图标
    const pngPath = join(__dirname, '../../resources/icon.png')
    try {
      const icon = nativeImage.createFromPath(pngPath)
      if (!icon.isEmpty()) {
        return icon
      }
    }
    catch {
      // 忽略错误
    }
  }

  return undefined
}
