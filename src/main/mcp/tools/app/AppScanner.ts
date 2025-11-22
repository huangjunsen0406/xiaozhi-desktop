import type { AppInfo, Platform } from './types'
/**
 * 跨平台应用扫描器
 * 统一接口，根据平台调用对应的扫描器
 */
import * as os from 'node:os'
import { LinuxScanner } from './scanners/LinuxScanner'
import { MacScanner } from './scanners/MacScanner'
import { WindowsScanner } from './scanners/WindowsScanner'

export class AppScanner {
  private static cachedApps: AppInfo[] | null = null
  private static lastScanTime = 0
  private static readonly CACHE_DURATION = 5 * 60 * 1000 // 5分钟缓存

  /**
   * 扫描已安装的应用程序
   * @param forceRefresh - 是否强制刷新缓存
   * @returns 应用信息列表
   */
  static async scanInstalled(forceRefresh = false): Promise<AppInfo[]> {
    const now = Date.now()

    // 检查缓存
    if (!forceRefresh && this.cachedApps && (now - this.lastScanTime < this.CACHE_DURATION)) {
      console.log('[AppScanner] 使用缓存的应用列表')
      return this.cachedApps
    }

    console.log('[AppScanner] 开始扫描已安装的应用...')

    try {
      const platform = os.platform() as Platform
      let apps: AppInfo[] = []

      if (platform === 'darwin') {
        apps = await MacScanner.scanInstalled()
      }
      else if (platform === 'win32') {
        apps = await WindowsScanner.scanInstalled()
      }
      else if (platform === 'linux') {
        apps = await LinuxScanner.scanInstalled()
      }
      else {
        console.error(`[AppScanner] 不支持的平台: ${platform}`)
        return []
      }

      // 按名称排序
      apps.sort((a, b) => a.name.localeCompare(b.name))

      // 更新缓存
      this.cachedApps = apps
      this.lastScanTime = now

      console.log(`[AppScanner] 扫描完成，共 ${apps.length} 个应用`)
      return apps
    }
    catch (error) {
      console.error('[AppScanner] 扫描应用失败:', error)
      return this.cachedApps || []
    }
  }

  /**
   * 清除缓存
   */
  static clearCache(): void {
    this.cachedApps = null
    this.lastScanTime = 0
    console.log('[AppScanner] 缓存已清除')
  }

  /**
   * 搜索应用
   * @param query - 搜索关键词
   * @returns 匹配的应用列表
   */
  static async search(query: string): Promise<AppInfo[]> {
    const apps = await this.scanInstalled()
    const lowerQuery = query.toLowerCase()

    return apps.filter(app =>
      app.name.toLowerCase().includes(lowerQuery)
      || app.displayName.toLowerCase().includes(lowerQuery),
    )
  }

  /**
   * 获取当前平台
   */
  static getPlatform(): Platform {
    return os.platform() as Platform
  }

  /**
   * 检查平台是否支持
   */
  static isSupported(): boolean {
    const platform = os.platform()
    return platform === 'darwin' || platform === 'win32' || platform === 'linux'
  }
}
