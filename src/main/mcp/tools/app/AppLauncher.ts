import type { LaunchResult, Platform } from './types'
/**
 * 跨平台应用启动器
 * 使用系统命令启动应用程序
 */
import { exec, spawn } from 'node:child_process'
import * as os from 'node:os'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

export class AppLauncher {
  /**
   * 启动应用程序（跨平台）
   * @param appName - 应用程序名称
   * @returns 启动结果
   */
  static async launch(appName: string): Promise<LaunchResult> {
    const platform = os.platform() as Platform

    console.log(`[AppLauncher] 尝试启动应用: ${appName}, 平台: ${platform}`)

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
        console.error(`[AppLauncher] ${message}`)
        return { success: false, message }
      }
    }
    catch (error) {
      const message = `启动应用失败: ${error}`
      console.error(`[AppLauncher] ${message}`, error)
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
        console.log(`[AppLauncher] macOS: 使用 open -a 成功启动: ${appName}`)
        return { success: true, message: `成功启动应用: ${appName}` }
      }
      catch {
        console.warn(`[AppLauncher] macOS: open -a 启动失败，尝试其他方法`)
      }

      // 方法 2: 尝试 /Applications 目录
      try {
        await execAsync(`open "/Applications/${appName}.app"`)
        console.log(`[AppLauncher] macOS: 通过 /Applications 启动成功: ${appName}`)
        return { success: true, message: `成功启动应用: ${appName}` }
      }
      catch {
        console.warn(`[AppLauncher] macOS: /Applications 启动失败`)
      }

      // 方法 3: 使用 osascript（AppleScript）
      try {
        const script = `tell application "${appName}" to activate`
        await execAsync(`osascript -e '${script}'`)
        console.log(`[AppLauncher] macOS: 使用 osascript 启动成功: ${appName}`)
        return { success: true, message: `成功启动应用: ${appName}` }
      }
      catch {
        console.warn(`[AppLauncher] macOS: osascript 启动失败`)
      }

      return { success: false, message: `未找到应用: ${appName}` }
    }
    catch (error) {
      return { success: false, message: `macOS 启动失败: ${error}` }
    }
  }

  /**
   * Windows: 使用 start 命令启动应用
   */
  private static async launchWindows(appName: string): Promise<LaunchResult> {
    try {
      // Windows 使用 start 命令（非阻塞）
      const child = spawn('cmd', ['/c', 'start', '', appName], {
        detached: true,
        stdio: 'ignore',
        shell: true,
      })

      // 分离子进程，避免父进程等待
      child.unref()

      console.log(`[AppLauncher] Windows: 成功启动应用: ${appName}`)
      return { success: true, message: `成功启动应用: ${appName}` }
    }
    catch (error) {
      const message = `Windows 启动失败: ${error}`
      console.error(`[AppLauncher] ${message}`, error)
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
        console.log(`[AppLauncher] Linux: 使用 xdg-open 成功启动: ${appName}`)
        return { success: true, message: `成功启动应用: ${appName}` }
      }
      catch (error) {
        console.warn(`[AppLauncher] Linux: xdg-open 启动失败，尝试其他方法： ${error}`)
      }

      // 方法 2: 尝试直接执行应用名称
      try {
        const child = spawn(appName, [], {
          detached: true,
          stdio: 'ignore',
        })
        child.unref()
        console.log(`[AppLauncher] Linux: 直接执行成功: ${appName}`)
        return { success: true, message: `成功启动应用: ${appName}` }
      }
      catch {
        console.warn(`[AppLauncher] Linux: 直接执行失败`)
      }

      // 方法 3: 使用 gtk-launch（GNOME/GTK 环境）
      try {
        const child = spawn('gtk-launch', [appName], {
          detached: true,
          stdio: 'ignore',
        })
        child.unref()
        console.log(`[AppLauncher] Linux: 使用 gtk-launch 成功启动: ${appName}`)
        return { success: true, message: `成功启动应用: ${appName}` }
      }
      catch {
        console.warn(`[AppLauncher] Linux: gtk-launch 启动失败`)
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
