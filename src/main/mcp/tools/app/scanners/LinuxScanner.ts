import type { AppInfo } from '../types'
/**
 * Linux 应用扫描器
 * 扫描 .desktop 文件
 */
import * as fs from 'node:fs'
import { promises as fsp } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { getLogger } from '../../../../utils/logger'
import { cleanAppName, dedupeApps } from './utils'

const logger = getLogger('LinuxScanner')

export class LinuxScanner {
  /**
   * 扫描已安装的应用程序
   * @returns 应用信息列表
   */
  static async scanInstalled(): Promise<AppInfo[]> {
    const apps: AppInfo[] = []

    try {
      for (const dir of ['/usr/share/applications', '/usr/local/share/applications'])
        apps.push(...await this.scanDesktopFiles(dir, 'application'))

      const userAppsDir = path.join(os.homedir(), '.local', 'share', 'applications')
      if (fs.existsSync(userAppsDir))
        apps.push(...await this.scanDesktopFiles(userAppsDir, 'user_application'))

      apps.push(...this.getSystemTools())

      const unique = dedupeApps(apps)
      logger.info(`扫描完成，找到 ${unique.length} 个应用`)
      return unique
    }
    catch (error) {
      logger.error('扫描应用失败', error)
      return []
    }
  }

  /**
   * 扫描 .desktop 文件
   */
  private static async scanDesktopFiles(
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

      // 并行解析每个 .desktop 文件；单个失败不影响整体
      const results = await Promise.all(
        files.map(async (file) => {
          if (!file.endsWith('.desktop'))
            return null
          const filePath = path.join(directory, file)
          try {
            return await this.parseDesktopFile(filePath, type)
          }
          catch {
            return null
          }
        }),
      )

      for (const info of results) {
        if (info)
          apps.push(info)
      }

      logger.info(`${directory}: 找到 ${apps.length} 个应用`)
    }
    catch (error) {
      logger.error(`扫描 desktop 文件失败 (${directory}):`, error)
    }

    return apps
  }

  /**
   * 解析 .desktop 文件
   */
  private static async parseDesktopFile(
    filePath: string,
    type: 'application' | 'user_application',
  ): Promise<AppInfo | null> {
    try {
      const content = await fsp.readFile(filePath, 'utf-8')
      const lines = content.split('\n')

      let name = ''
      let displayName = ''
      let exec = ''

      for (const line of lines) {
        const trimmed = line.trim()

        // 提取 Name
        if (trimmed.startsWith('Name=')) {
          displayName = trimmed.substring(5)
        }

        // 提取 Exec（执行命令）
        if (trimmed.startsWith('Exec=')) {
          exec = trimmed.substring(5)
        }

        // 如果已经找到所需信息，提前退出
        if (displayName && exec)
          break
      }

      if (!displayName || !exec) {
        return null
      }

      // 从 Exec 中提取应用名称
      // 例如：/usr/bin/firefox -> firefox
      const execParts = exec.split(/\s+/)
      const execPath = execParts[0]
      name = path.basename(execPath)

      // 清理名称
      const cleanName = cleanAppName(name)

      return {
        name: cleanName,
        displayName,
        path: execPath,
        type,
      }
    }
    catch (error) {
      logger.error(`解析 desktop 文件失败 (${filePath}):`, error)
      return null
    }
  }

  /**
   * 获取常用系统工具
   */
  private static getSystemTools(): AppInfo[] {
    return [
      {
        name: 'firefox',
        displayName: 'Firefox',
        path: '/usr/bin/firefox',
        type: 'system',
      },
      {
        name: 'gnome-calculator',
        displayName: '计算器',
        path: '/usr/bin/gnome-calculator',
        type: 'system',
      },
      {
        name: 'gedit',
        displayName: '文本编辑器',
        path: '/usr/bin/gedit',
        type: 'system',
      },
      {
        name: 'nautilus',
        displayName: '文件管理器',
        path: '/usr/bin/nautilus',
        type: 'system',
      },
    ]
  }
}
