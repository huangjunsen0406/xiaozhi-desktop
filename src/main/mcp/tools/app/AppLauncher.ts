import type { LaunchResult, Platform } from './types'
/**
 * 跨平台应用启动器
 * 使用系统命令启动应用程序
 */
import { exec, spawn } from 'node:child_process'
import * as os from 'node:os'
import { promisify } from 'node:util'
import { getLogger } from '../../../utils/logger'
import { AppScanner } from './AppScanner'

const execAsync = promisify(exec)
const logger = getLogger('AppLauncher')

export class AppLauncher {
  /**
   * 启动应用程序（跨平台）
   * @param appName - 应用程序名称
   * @returns 启动结果
   */
  static async launch(appName: string): Promise<LaunchResult> {
    const platform = os.platform() as Platform

    logger.info(`尝试启动应用: ${appName}, 平台: ${platform}`)

    try {
      if (platform === 'darwin') {
        return await this.launchMac(appName)
      }
      else if (platform === 'win32') {
        return await this.launchWindows(appName)
      }
      else if (platform === 'linux') {
        return await this.launchLinux(appName)
      }
      else {
        const message = `不支持的平台: ${platform}`
        logger.error(`${message}`)
        return { success: false, message }
      }
    }
    catch (error) {
      const message = `启动应用失败: ${error}`
      logger.error(`${message}`, error)
      return { success: false, message }
    }
  }

  /**
   * macOS: 使用 open 命令启动应用
   */
  private static async launchMac(appName: string): Promise<LaunchResult> {
    try {
      // 方法 1: 使用 open -a 命令（最常用）
      try {
        await execAsync(`open -a "${appName}"`)
        logger.info(`macOS: 使用 open -a 成功启动: ${appName}`)
        return { success: true, message: `成功启动应用: ${appName}` }
      }
      catch {
        logger.warn(`macOS: open -a 启动失败，尝试其他方法`)
      }

      // 方法 2: 尝试 /Applications 目录
      try {
        await execAsync(`open "/Applications/${appName}.app"`)
        logger.info(`macOS: 通过 /Applications 启动成功: ${appName}`)
        return { success: true, message: `成功启动应用: ${appName}` }
      }
      catch {
        logger.warn(`macOS: /Applications 启动失败`)
      }

      // 方法 3: 使用 osascript（AppleScript）
      try {
        const script = `tell application "${appName}" to activate`
        await execAsync(`osascript -e '${script}'`)
        logger.info(`macOS: 使用 osascript 启动成功: ${appName}`)
        return { success: true, message: `成功启动应用: ${appName}` }
      }
      catch {
        logger.warn(`macOS: osascript 启动失败`)
      }

      return { success: false, message: `未找到应用: ${appName}` }
    }
    catch (error) {
      return { success: false, message: `macOS 启动失败: ${error}` }
    }
  }

  /**
   * Windows: 使用 start 命令启动应用
   * 优先通过 AppScanner 扫描缓存匹配应用路径启动，匹配不到时 fallback 到 cmd /c start
   */
  private static async launchWindows(appName: string): Promise<LaunchResult> {
    try {
      // 先通过 AppScanner 查找匹配的已安装应用
      try {
        const matchedApps = await AppScanner.search(appName)
        if (matchedApps.length > 0) {
          const matched = matchedApps[0]
          logger.info(`Windows: 通过扫描结果匹配到应用: ${matched.displayName}, 路径: ${matched.path}`)

          const child = spawn('cmd', ['/c', 'start', '', matched.path], {
            detached: true,
            stdio: 'ignore',
            shell: true,
          })
          child.unref()

          return { success: true, message: `成功启动应用: ${matched.displayName}` }
        }
      }
      catch (error) {
        logger.warn(`Windows: AppScanner 搜索失败，使用 fallback: ${error}`)
      }

      // Fallback: 直接使用 cmd /c start 启动
      logger.info(`Windows: 未匹配到扫描结果，使用 fallback 启动: ${appName}`)
      const child = spawn('cmd', ['/c', 'start', '', appName], {
        detached: true,
        stdio: 'ignore',
        shell: true,
      })
      child.unref()

      return { success: true, message: `成功启动应用: ${appName}` }
    }
    catch (error) {
      const message = `Windows 启动失败: ${error}`
      logger.error(`${message}`, error)
      return { success: false, message }
    }
  }

  /**
   * Linux: 使用 xdg-open 或其他方法启动应用
   */
  private static async launchLinux(appName: string): Promise<LaunchResult> {
    try {
      // 方法 1: 使用 xdg-open（标准方法）
      try {
        const child = spawn('xdg-open', [appName], {
          detached: true,
          stdio: 'ignore',
        })
        child.unref()
        logger.info(`Linux: 使用 xdg-open 成功启动: ${appName}`)
        return { success: true, message: `成功启动应用: ${appName}` }
      }
      catch (error) {
        logger.warn(`Linux: xdg-open 启动失败，尝试其他方法： ${error}`)
      }

      // 方法 2: 尝试直接执行应用名称
      try {
        const child = spawn(appName, [], {
          detached: true,
          stdio: 'ignore',
        })
        child.unref()
        logger.info(`Linux: 直接执行成功: ${appName}`)
        return { success: true, message: `成功启动应用: ${appName}` }
      }
      catch {
        logger.warn(`Linux: 直接执行失败`)
      }

      // 方法 3: 使用 gtk-launch（GNOME/GTK 环境）
      try {
        const child = spawn('gtk-launch', [appName], {
          detached: true,
          stdio: 'ignore',
        })
        child.unref()
        logger.info(`Linux: 使用 gtk-launch 成功启动: ${appName}`)
        return { success: true, message: `成功启动应用: ${appName}` }
      }
      catch {
        logger.warn(`Linux: gtk-launch 启动失败`)
      }

      return { success: false, message: `未找到应用: ${appName}` }
    }
    catch (error) {
      return { success: false, message: `Linux 启动失败: ${error}` }
    }
  }

  /**
   * 检查平台是否支持
   */
  static isSupported(): boolean {
    const platform = os.platform()
    return platform === 'darwin' || platform === 'win32' || platform === 'linux'
  }

  /**
   * 获取当前平台
   */
  static getPlatform(): Platform {
    return os.platform() as Platform
  }
}
