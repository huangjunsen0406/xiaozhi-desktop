import type { LaunchResult, Platform } from './types'
/**
 * 跨平台应用启动器
 *
 * 统一策略（不拼 shell 命令字符串）：
 * 1. AppScanner 解析出真实路径
 * 2. 路径用 Electron shell.openPath / Node spawn
 * 3. bare name 再按平台做有限 fallback（仍不走 cmd）
 */
import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { shell } from 'electron'
import { getLogger } from '../../../utils/logger'
import { AppScanner } from './AppScanner'

const logger = getLogger('AppLauncher')

export class AppLauncher {
  /**
   * 启动应用程序（跨平台）
   */
  static async launch(appName: string): Promise<LaunchResult> {
    const platform = os.platform() as Platform
    const name = appName?.trim()

    if (!name) {
      return { success: false, message: '应用名称为空' }
    }

    logger.info(`尝试启动应用: ${name}, 平台: ${platform}`)

    try {
      if (platform === 'darwin') {
        return await this.launchMac(name)
      }
      if (platform === 'win32') {
        return await this.launchWindows(name)
      }
      if (platform === 'linux') {
        return await this.launchLinux(name)
      }

      const message = `不支持的平台: ${platform}`
      logger.error(message)
      return { success: false, message }
    }
    catch (error) {
      const message = `启动应用失败: ${error}`
      logger.error(message, error)
      return { success: false, message }
    }
  }

  // ─── macOS ───────────────────────────────────────────────

  /**
   * macOS：扫描命中 .app → openPath；否则试常见目录 / PATH spawn。
   * 不再调用 open / osascript 命令行。
   */
  private static async launchMac(appName: string): Promise<LaunchResult> {
    const errors: string[] = []

    // 1) 扫描（/Applications、~/Applications、系统工具）
    try {
      const matched = await this.firstScanMatch(appName)
      if (matched) {
        logger.info(`macOS: 扫描命中 ${matched.displayName} → ${matched.path}`)
        await this.openPathOrThrow(matched.path)
        return { success: true, message: `成功启动应用: ${matched.displayName}` }
      }
    }
    catch (error) {
      errors.push(`扫描启动失败: ${error}`)
    }

    // 2) 输入已是 .app / 路径
    if (this.looksLikeFilesystemPath(appName) || appName.endsWith('.app')) {
      try {
        const p = appName.endsWith('.app') || this.looksLikeFilesystemPath(appName)
          ? appName
          : `${appName}.app`
        await this.openPathOrThrow(p)
        return { success: true, message: `成功启动应用: ${appName}` }
      }
      catch (error) {
        errors.push(`路径启动失败: ${error}`)
      }
    }

    // 3) 常见安装位置按名拼路径（等价于以前 open -a 的一部分场景）
    const candidates = this.macAppCandidates(appName)
    for (const candidate of candidates) {
      if (!fs.existsSync(candidate))
        continue
      try {
        await this.openPathOrThrow(candidate)
        logger.info(`macOS: 候选路径启动成功: ${candidate}`)
        return { success: true, message: `成功启动应用: ${appName}` }
      }
      catch (error) {
        errors.push(`${candidate}: ${error}`)
      }
    }

    const detail = errors.length ? ` (${errors.join('; ')})` : ''
    return { success: false, message: `未找到或无法启动应用: ${appName}${detail}` }
  }

  private static macAppCandidates(appName: string): string[] {
    const base = appName.endsWith('.app') ? appName : `${appName}.app`
    const home = os.homedir()
    return [
      path.join('/Applications', base),
      path.join(home, 'Applications', base),
      path.join('/System/Applications', base),
      path.join('/System/Library/CoreServices', base),
      // 用户有时传不带空格的短名，扫描更靠谱；这里仅作兜底
    ]
  }

  // ─── Windows ─────────────────────────────────────────────

  /**
   * Windows：纯 Node/Electron，不调用 cmd/start
   */
  private static async launchWindows(appName: string): Promise<LaunchResult> {
    const errors: string[] = []

    try {
      const matched = await this.firstScanMatch(appName)
      if (matched) {
        logger.info(`Windows: 扫描命中 ${matched.displayName} → ${matched.path}`)
        await this.launchWindowsPath(matched.path)
        return { success: true, message: `成功启动应用: ${matched.displayName}` }
      }
    }
    catch (error) {
      errors.push(`扫描启动失败: ${error}`)
    }

    if (this.isWindowsFilesystemPath(appName)) {
      try {
        await this.launchWindowsPath(appName)
        return { success: true, message: `成功启动应用: ${appName}` }
      }
      catch (error) {
        errors.push(`路径启动失败: ${error}`)
      }
    }

    // bare name：CreateProcess + PATH（notepad 等），无 shell
    try {
      await this.spawnDetached(appName, [], { windowsHide: true })
      logger.info(`Windows: PATH spawn 成功: ${appName}`)
      return { success: true, message: `成功启动应用: ${appName}` }
    }
    catch (error) {
      errors.push(`PATH spawn 失败: ${error}`)
    }

    if (!/\.exe$/i.test(appName)) {
      try {
        await this.spawnDetached(`${appName}.exe`, [], { windowsHide: true })
        logger.info(`Windows: PATH spawn 成功: ${appName}.exe`)
        return { success: true, message: `成功启动应用: ${appName}` }
      }
      catch (error) {
        errors.push(`PATH spawn ${appName}.exe 失败: ${error}`)
      }
    }

    const detail = errors.length ? ` (${errors.join('; ')})` : ''
    return { success: false, message: `未找到或无法启动应用: ${appName}${detail}` }
  }

  private static async launchWindowsPath(target: string): Promise<void> {
    const trimmed = target.trim()
    if (!trimmed)
      throw new Error('启动目标为空')

    const ext = path.extname(trimmed).toLowerCase()

    if (ext === '.exe') {
      try {
        await this.spawnDetached(trimmed, [], { windowsHide: true })
        logger.info(`Windows: spawn exe 成功: ${trimmed}`)
        return
      }
      catch (error) {
        logger.warn(`Windows: spawn exe 失败，改用 shell.openPath: ${error}`)
      }
    }

    // .lnk / 其它：ShellExecute，不经过 cmd
    await this.openPathOrThrow(trimmed)
    logger.info(`Windows: shell.openPath 成功: ${trimmed}`)
  }

  private static isWindowsFilesystemPath(target: string): boolean {
    const t = target.trim()
    if (!t)
      return false
    // 盘符 / UNC / 含路径分隔符
    if (/^[a-z]:[\\/]/i.test(t) || t.startsWith('\\\\') || /[\\/]/.test(t))
      return true
    // 常见可启动后缀（非捕获组，仅做匹配）
    return /\.(?:exe|lnk|bat|cmd|com|msi|msc|cpl|url)$/i.test(t)
  }

  // ─── Linux ───────────────────────────────────────────────

  /**
   * Linux：扫描得到的 Exec 路径直接 spawn；文件路径 openPath。
   * 不再优先依赖 xdg-open/gtk-launch 命令行（openPath 在 Linux 上内部即 xdg-open）。
   */
  private static async launchLinux(appName: string): Promise<LaunchResult> {
    const errors: string[] = []

    try {
      const matched = await this.firstScanMatch(appName)
      if (matched) {
        logger.info(`Linux: 扫描命中 ${matched.displayName} → ${matched.path}`)
        await this.launchLinuxTarget(matched.path)
        return { success: true, message: `成功启动应用: ${matched.displayName}` }
      }
    }
    catch (error) {
      errors.push(`扫描启动失败: ${error}`)
    }

    if (this.looksLikeFilesystemPath(appName)) {
      try {
        await this.launchLinuxTarget(appName)
        return { success: true, message: `成功启动应用: ${appName}` }
      }
      catch (error) {
        errors.push(`路径启动失败: ${error}`)
      }
    }

    // bare name：PATH 上的可执行文件
    try {
      await this.spawnDetached(appName, [])
      logger.info(`Linux: PATH spawn 成功: ${appName}`)
      return { success: true, message: `成功启动应用: ${appName}` }
    }
    catch (error) {
      errors.push(`PATH spawn 失败: ${error}`)
    }

    // 最后：把名字当 desktop id / 文件交给 openPath（内部 xdg-open）
    try {
      await this.openPathOrThrow(appName)
      logger.info(`Linux: shell.openPath 成功: ${appName}`)
      return { success: true, message: `成功启动应用: ${appName}` }
    }
    catch (error) {
      errors.push(`openPath 失败: ${error}`)
    }

    const detail = errors.length ? ` (${errors.join('; ')})` : ''
    return { success: false, message: `未找到或无法启动应用: ${appName}${detail}` }
  }

  private static async launchLinuxTarget(target: string): Promise<void> {
    const trimmed = target.trim()
    if (!trimmed)
      throw new Error('启动目标为空')

    // 可执行文件 / 无后缀二进制：直接 spawn
    // .desktop 或普通文件：openPath 走桌面默认关联
    const ext = path.extname(trimmed).toLowerCase()
    const isDesktop = ext === '.desktop'
    const looksExecutable = !ext || ext === '.sh' || ext === '.AppImage' || ext === '.bin'

    if (!isDesktop && looksExecutable) {
      try {
        await this.spawnDetached(trimmed, [])
        logger.info(`Linux: spawn 成功: ${trimmed}`)
        return
      }
      catch (error) {
        logger.warn(`Linux: spawn 失败，改用 openPath: ${error}`)
      }
    }

    await this.openPathOrThrow(trimmed)
    logger.info(`Linux: shell.openPath 成功: ${trimmed}`)
  }

  // ─── 共用 ────────────────────────────────────────────────

  private static async firstScanMatch(appName: string) {
    const matchedApps = await AppScanner.search(appName)
    return matchedApps[0] ?? null
  }

  /**
   * Electron shell.openPath：各平台用系统默认方式打开路径
   * - Windows: ShellExecute
   * - macOS: NSWorkspace / Launch Services
   * - Linux: 通常 xdg-open
   * 失败时返回非空错误字符串（不 throw），这里统一成 throw 方便上层串联
   */
  private static async openPathOrThrow(target: string): Promise<void> {
    const errMsg = await shell.openPath(target)
    if (errMsg)
      throw new Error(errMsg)
  }

  private static looksLikeFilesystemPath(target: string): boolean {
    const t = target.trim()
    if (!t)
      return false
    if (t.startsWith('/') || t.startsWith('~/') || t.startsWith('./') || t.startsWith('../'))
      return true
    if (/^[a-z]:[\\/]/i.test(t) || t.startsWith('\\\\') || t.includes('/') || t.includes('\\'))
      return true
    return false
  }

  /**
   * 分离进程；明确 shell:false，避免 Windows 套 cmd
   */
  private static spawnDetached(
    command: string,
    args: string[],
    options: { windowsHide?: boolean } = {},
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        detached: true,
        stdio: 'ignore',
        shell: false,
        windowsHide: options.windowsHide,
      })

      let settled = false
      const done = (err?: Error) => {
        if (settled)
          return
        settled = true
        if (err)
          reject(err)
        else
          resolve()
      }

      child.once('error', done)
      child.once('spawn', () => {
        child.unref()
        done()
      })
    })
  }

  static isSupported(): boolean {
    const platform = os.platform()
    return platform === 'darwin' || platform === 'win32' || platform === 'linux'
  }

  static getPlatform(): Platform {
    return os.platform() as Platform
  }
}
