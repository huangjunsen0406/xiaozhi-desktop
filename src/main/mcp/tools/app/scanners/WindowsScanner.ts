import type { AppInfo } from '../types'
/**
 * Windows 应用扫描器
 * 扫描开始菜单、Program Files 等目录
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import process from 'node:process'

import { createLogger } from '../../../../utils/logger'

const logger = createLogger('WindowsScanner')

export class WindowsScanner {
  /**
   * 扫描已安装的应用程序
   * @returns 应用信息列表
   */
  static async scanInstalled(): Promise<AppInfo[]> {
    const apps: AppInfo[] = []
    const appNames = new Set<string>() // 去重

    try {
      // 1. 扫描开始菜单（用户）
      const userStartMenu = path.join(
        process.env.APPDATA || '',
        'Microsoft',
        'Windows',
        'Start Menu',
        'Programs',
      )
      const userApps = await this.scanStartMenu(userStartMenu, 'user_application')
      this.addUniqueApps(apps, userApps, appNames)

      // 2. 扫描开始菜单（所有用户）
      const allUsersStartMenu = path.join(
        process.env.ProgramData || 'C:\\ProgramData',
        'Microsoft',
        'Windows',
        'Start Menu',
        'Programs',
      )
      const allUsersApps = await this.scanStartMenu(allUsersStartMenu, 'application')
      this.addUniqueApps(apps, allUsersApps, appNames)

      // 3. 扫描 Program Files
      const programFiles = process.env.ProgramFiles || 'C:\\Program Files'
      const programFilesApps = await this.scanProgramFiles(programFiles, 'application')
      this.addUniqueApps(apps, programFilesApps, appNames)

      // 4. 扫描 Program Files (x86)
      const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
      if (fs.existsSync(programFilesX86)) {
        const programFilesX86Apps = await this.scanProgramFiles(programFilesX86, 'application')
        this.addUniqueApps(apps, programFilesX86Apps, appNames)
      }

      // 5. 添加常用系统工具
      const systemTools = this.getSystemTools()
      this.addUniqueApps(apps, systemTools, appNames)

      logger.info(`扫描完成，找到 ${apps.length} 个应用`)
      return apps
    }
    catch (error) {
      logger.error('扫描应用失败', error)
      return []
    }
  }

  /**
   * 扫描开始菜单目录
   */
  private static async scanStartMenu(
    directory: string,
    type: 'application' | 'user_application',
  ): Promise<AppInfo[]> {
    const apps: AppInfo[] = []

    try {
      if (!fs.existsSync(directory)) {
        logger.warn(`目录不存在: ${directory}`)
        return []
      }

      // 递归扫描 .lnk 文件
      await this.scanDirectoryRecursive(directory, apps, type)

      logger.info(`${directory}: 找到 ${apps.length} 个快捷方式`)
    }
    catch (error) {
      logger.error(`扫描开始菜单失败 (${directory}):`, error)
    }

    return apps
  }

  /**
   * 递归扫描目录
   */
  private static async scanDirectoryRecursive(
    directory: string,
    apps: AppInfo[],
    type: 'application' | 'user_application',
    depth = 0,
  ): Promise<void> {
    // 限制递归深度
    if (depth > 3)
      return

    try {
      const files = fs.readdirSync(directory)

      for (const file of files) {
        const filePath = path.join(directory, file)

        try {
          const stat = fs.statSync(filePath)

          if (stat.isDirectory()) {
            // 递归扫描子目录
            await this.scanDirectoryRecursive(filePath, apps, type, depth + 1)
          }
          else if (file.endsWith('.lnk')) {
            // 快捷方式文件
            const appName = file.replace('.lnk', '')
            const cleanName = this.cleanAppName(appName)

            apps.push({
              name: cleanName,
              displayName: appName,
              path: filePath,
              type,
            })
          }
        }
        catch {
          // 跳过无法访问的文件
          continue
        }
      }
    }
    catch (error) {
      logger.error(`递归扫描失败 (${directory}):`, error)
    }
  }

  /**
   * 扫描 Program Files 目录
   */
  private static async scanProgramFiles(
    directory: string,
    type: 'application',
  ): Promise<AppInfo[]> {
    const apps: AppInfo[] = []

    try {
      if (!fs.existsSync(directory)) {
        logger.warn(`目录不存在: ${directory}`)
        return []
      }

      const folders = fs.readdirSync(directory)

      for (const folder of folders) {
        const folderPath = path.join(directory, folder)

        try {
          const stat = fs.statSync(folderPath)
          if (!stat.isDirectory())
            continue

          // 查找 .exe 文件
          const exeFiles = this.findExeFiles(folderPath)
          for (const exePath of exeFiles) {
            const exeName = path.basename(exePath, '.exe')
            const cleanName = this.cleanAppName(exeName)

            apps.push({
              name: cleanName,
              displayName: exeName,
              path: exePath,
              type,
            })
          }
        }
        catch {
          // 跳过无法访问的文件夹
          continue
        }
      }

      logger.info(`${directory}: 找到 ${apps.length} 个应用`)
    }
    catch (error) {
      logger.error(`扫描 Program Files 失败 (${directory}):`, error)
    }

    return apps
  }

  /**
   * 查找目录下的 .exe 文件（仅第一层）
   */
  private static findExeFiles(directory: string): string[] {
    const exeFiles: string[] = []

    try {
      const files = fs.readdirSync(directory)

      for (const file of files) {
        if (file.endsWith('.exe')) {
          exeFiles.push(path.join(directory, file))
        }
      }
    }
    catch {
      // 跳过无法访问的目录
    }

    return exeFiles
  }

  /**
   * 清理应用名称
   */
  private static cleanAppName(appName: string): string {
    // 移除版本号
    let clean = appName.replace(/\s+\d+(\.\d+)*$/, '')

    // 移除常见后缀
    clean = clean.replace(/\s*-\s*Shortcut$/i, '')
    clean = clean.replace(/\s*\(.*\)$/, '')

    // 移除特殊字符
    clean = clean.replace(/[™®©]/g, '')

    // 移除多余空格
    clean = clean.trim()

    return clean || appName
  }

  /**
   * 添加唯一应用（去重）
   */
  private static addUniqueApps(
    apps: AppInfo[],
    newApps: AppInfo[],
    appNames: Set<string>,
  ): void {
    for (const app of newApps) {
      const key = app.name.toLowerCase()
      if (!appNames.has(key)) {
        apps.push(app)
        appNames.add(key)
      }
    }
  }

  /**
   * 获取常用系统工具
   */
  private static getSystemTools(): AppInfo[] {
    return [
      {
        name: 'notepad',
        displayName: '记事本',
        path: 'C:\\Windows\\System32\\notepad.exe',
        type: 'system',
      },
      {
        name: 'calc',
        displayName: '计算器',
        path: 'calc',
        type: 'system',
      },
      {
        name: 'mspaint',
        displayName: '画图',
        path: 'C:\\Windows\\System32\\mspaint.exe',
        type: 'system',
      },
      {
        name: 'explorer',
        displayName: '资源管理器',
        path: 'C:\\Windows\\explorer.exe',
        type: 'system',
      },
      {
        name: 'cmd',
        displayName: '命令提示符',
        path: 'C:\\Windows\\System32\\cmd.exe',
        type: 'system',
      },
    ]
  }
}
