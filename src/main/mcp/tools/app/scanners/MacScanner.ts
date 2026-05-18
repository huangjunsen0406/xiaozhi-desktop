import type { AppInfo } from '../types'
/**
 * macOS 应用扫描器
 * 扫描 /Applications 和 ~/Applications 目录
 */
import * as fs from 'node:fs'
import { promises as fsp } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { getLogger } from '../../../../utils/logger'

const logger = getLogger('MacScanner')

export class MacScanner {
  /**
   * 扫描已安装的应用程序
   * @returns 应用信息列表
   */
  static async scanInstalled(): Promise<AppInfo[]> {
    const apps: AppInfo[] = []

    try {
      // 1. 扫描系统应用目录 /Applications
      const systemApps = await this.scanDirectory('/Applications', 'application')
      apps.push(...systemApps)

      // 2. 扫描用户应用目录 ~/Applications
      const userAppsDir = path.join(os.homedir(), 'Applications')
      if (fs.existsSync(userAppsDir)) {
        const userApps = await this.scanDirectory(userAppsDir, 'user_application')
        apps.push(...userApps)
      }

      // 3. 添加常用系统应用
      const systemTools = this.getSystemTools()
      apps.push(...systemTools)

      logger.info(`扫描完成，找到 ${apps.length} 个应用`)
      return apps
    }
    catch (error) {
      logger.error('扫描应用失败', error)
      return []
    }
  }

  /**
   * 扫描指定目录下的 .app 应用
   */
  private static async scanDirectory(
    directory: string,
    type: 'application' | 'user_application',
  ): Promise<AppInfo[]> {
    const apps: AppInfo[] = []

    try {
      if (!fs.existsSync(directory)) {
        logger.warn(`目录不存在: ${directory}`)
        return []
      }

      const files = await fsp.readdir(directory)

      for (const file of files) {
        if (file.endsWith('.app')) {
          const appPath = path.join(directory, file)
          const appName = file.replace('.app', '')
          const cleanName = this.cleanAppName(appName)

          apps.push({
            name: cleanName,
            displayName: appName,
            path: appPath,
            type,
          })
        }
      }

      logger.info(`${directory}: 找到 ${apps.length} 个应用`)
    }
    catch (error) {
      logger.error(`扫描目录失败 (${directory}):`, error)
    }

    return apps
  }

  /**
   * 清理应用名称
   * 移除版本号、特殊字符等
   */
  private static cleanAppName(appName: string): string {
    // 移除版本号（如 "Chrome 2.0" -> "Chrome"）
    let clean = appName.replace(/\s+\d+(\.\d+)*$/, '')

    // 移除特殊字符
    clean = clean.replace(/[™®©]/g, '')

    // 移除多余空格
    clean = clean.trim()

    return clean || appName
  }

  /**
   * 获取常用系统工具
   */
  private static getSystemTools(): AppInfo[] {
    return [
      {
        name: 'Safari',
        displayName: 'Safari',
        path: '/Applications/Safari.app',
        type: 'system',
      },
      {
        name: 'Calculator',
        displayName: '计算器',
        path: '/System/Applications/Calculator.app',
        type: 'system',
      },
      {
        name: 'TextEdit',
        displayName: '文本编辑',
        path: '/System/Applications/TextEdit.app',
        type: 'system',
      },
      {
        name: 'Preview',
        displayName: '预览',
        path: '/System/Applications/Preview.app',
        type: 'system',
      },
      {
        name: 'Calendar',
        displayName: '日历',
        path: '/System/Applications/Calendar.app',
        type: 'system',
      },
      {
        name: 'Mail',
        displayName: '邮件',
        path: '/System/Applications/Mail.app',
        type: 'system',
      },
      {
        name: 'Notes',
        displayName: '备忘录',
        path: '/System/Applications/Notes.app',
        type: 'system',
      },
      {
        name: 'Finder',
        displayName: '访达',
        path: '/System/Library/CoreServices/Finder.app',
        type: 'system',
      },
    ]
  }
}
