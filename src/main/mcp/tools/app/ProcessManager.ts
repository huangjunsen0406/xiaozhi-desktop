import type { Platform, ProcessInfo } from './types'
/**
 * 跨平台进程管理器
 * 负责列出和关闭系统进程
 */
import { exec } from 'node:child_process'
import * as os from 'node:os'
import { promisify } from 'node:util'

import { getLogger } from '../../../utils/logger'

const logger = getLogger('ProcessManager')

const execAsync = promisify(exec)

export class ProcessManager {
  /**
   * 列出运行中的进程
   * @param filter - 可选的过滤条件（进程名）
   * @param includeSystemProcesses - 是否包含系统进程（默认 false，仅用户应用）
   * @returns 进程信息列表
   */
  static async listRunning(filter?: string, includeSystemProcesses = false): Promise<ProcessInfo[]> {
    const platform = os.platform() as Platform

    logger.info(`列出运行进程, 平台: ${platform}, 过滤: ${filter || '无'}`)

    try {
      let processes: ProcessInfo[] = []

      if (platform === 'darwin' || platform === 'linux') {
        processes = await this.listRunningUnix(filter)
      }
      else if (platform === 'win32') {
        processes = await this.listRunningWindows(filter)
      }
      else {
        logger.error(`不支持的平台: ${platform}`)
        return []
      }

      // 如果不包含系统进程，则过滤掉
      if (!includeSystemProcesses) {
        processes = this.filterUserApplications(processes, platform)
        logger.info(`过滤后剩余 ${processes.length} 个用户应用`)

        // Windows: tasklist /V 会把每个进程实例单独列一条（如上百条 chrome.exe）
        // 在 list_running 路径上按 image name 去重并合并，避免回包过于啰嗦。
        // killByName 走 includeSystemProcesses=true 不走这里，不会漏 kill。
        if (platform === 'win32') {
          processes = this.dedupeByName(processes)
          logger.info(`Windows 按 image name 去重后剩余 ${processes.length} 条`)
        }
      }

      return processes
    }
    catch (error) {
      logger.error('列出进程失败', error)
      return []
    }
  }

  /**
   * 关闭进程
   * @param pid - 进程 ID
   * @param force - 是否强制关闭
   * @returns 是否成功
   */
  static async kill(pid: number, force = false): Promise<boolean> {
    const platform = os.platform() as Platform

    logger.info(`关闭进程: PID=${pid}, 强制=${force}, 平台=${platform}`)

    try {
      if (platform === 'darwin' || platform === 'linux') {
        return await this.killUnix(pid, force)
      }
      else if (platform === 'win32') {
        return await this.killWindows(pid, force)
      }
      else {
        logger.error(`不支持的平台: ${platform}`)
        return false
      }
    }
    catch (error) {
      logger.error('关闭进程失败', error)
      return false
    }
  }

  /**
   * 根据应用名称查找并关闭进程
   * @param appName - 应用名称
   * @param force - 是否强制关闭
   * @returns 成功关闭的进程数
   */
  static async killByName(appName: string, force = false): Promise<number> {
    logger.info(`根据名称关闭应用: ${appName}, 强制=${force}`)

    try {
      // 1. 列出所有匹配的进程（包括系统进程，因为用户可能想关闭它们）
      const processes = await this.listRunning(appName, true)

      if (processes.length === 0) {
        logger.warn(`未找到运行中的应用: ${appName}`)
        return 0
      }

      logger.info(`找到 ${processes.length} 个匹配的进程`)

      // 2. 逐个关闭进程
      let successCount = 0
      for (const proc of processes) {
        const success = await this.kill(proc.pid, force)
        if (success) {
          successCount++
          logger.info(`成功关闭进程: ${proc.name} (PID: ${proc.pid})`)
        }
        else {
          logger.warn(`关闭进程失败: ${proc.name} (PID: ${proc.pid})`)
        }
      }

      logger.info(`关闭操作完成: ${successCount}/${processes.length}`)
      return successCount
    }
    catch (error) {
      logger.error('根据名称关闭应用失败', error)
      return 0
    }
  }

  // ========== 公共过滤辅助 ==========

  /**
   * 按 image name 去重合并进程
   *
   * 同名进程（如多条 chrome.exe）合并为一条：
   * - pid 取该组中最小的 pid（通常是父/最早进程）
   * - cpu / memory 累加
   * - windowTitle / userName 取第一个非空值
   * - instances 记录该组进程数
   */
  private static dedupeByName(processes: ProcessInfo[]): ProcessInfo[] {
    const grouped = new Map<string, ProcessInfo>()

    for (const proc of processes) {
      const key = proc.name.toLowerCase()
      const existing = grouped.get(key)

      if (!existing) {
        grouped.set(key, {
          ...proc,
          instances: 1,
        })
        continue
      }

      // 合并到已存在的条目
      existing.instances = (existing.instances ?? 1) + 1
      if (proc.pid < existing.pid) {
        existing.pid = proc.pid
      }
      if (typeof proc.cpu === 'number') {
        existing.cpu = (existing.cpu ?? 0) + proc.cpu
      }
      if (typeof proc.memory === 'number') {
        existing.memory = (existing.memory ?? 0) + proc.memory
      }
      if (!existing.windowTitle && proc.windowTitle) {
        existing.windowTitle = proc.windowTitle
      }
      if (!existing.userName && proc.userName) {
        existing.userName = proc.userName
      }
    }

    return Array.from(grouped.values())
  }

  private static readonly SYSTEM_KEYWORDS = [
    'com.apple.',
    'mdworker',
    'kernel_task',
    'launchd',
    'usereventagent',
    'cfprefsd',
    'commcenter',
    'windowserver',
    'dock',
    'finder',
    'loginwindow',
    'systemuiserver',
    'notifyd',
    'syslogd',
    'coreservicesd',
    'mds',
    'bluetoothd',
    'airportd',
    'coreaudiod',
    'fontd',
    'imagent',
    'identityservicesd',
    'softwareupdated',
    'liquiddetectiond',
    'helper (renderer)',
    'helper (gpu)',
    'helper (plugin)',
    'helper',
    'systemd',
    'dbus',
    'xorg',
    'kworker',
  ]

  private static readonly EXCLUDE_PATTERNS = [
    '.appex/',
    'plugins/',
    'xpcservices/',
    'frameworks/',
    '/system/library/coreservices/',
    '/system/library/privateframeworks/',
    'widgetextension',
    'extension.appex',
    'lsp_server',
    'lsp_runner',
    '.venv/bin/',
    '.vscode/extensions/',
    'node_modules/',
    'applelanguages',
    '--seatbelt-client',
    'loginitems/',
  ]

  private static readonly LINUX_SYSTEM_PATHS = [
    '/lib/systemd/',
    '/usr/lib/systemd/',
    '/usr/libexec/',
    '/usr/sbin/',
    '/sbin/',
  ]

  private static readonly LINUX_SYSTEM_DAEMONS = [
    'dbus-daemon',
    'systemd',
    'gvfsd',
    'at-spi-bus-launcher',
    'at-spi2-registryd',
    'gnome-keyring-daemon',
    'pulseaudio',
    'pipewire',
    'xdg-desktop-portal',
    'xdg-permission-store',
    'gdm',
    'snapd',
  ]

  private static readonly WINDOWS_SYSTEM_PATHS = [
    'c:\\windows\\system32\\',
    'c:\\windows\\syswow64\\',
    'c:\\windows\\explorer.exe',
  ]

  private static readonly WINDOWS_SYSTEM_PROCESSES = new Set([
    'svchost.exe',
    'dwm.exe',
    'csrss.exe',
    'wininit.exe',
    'services.exe',
    'lsass.exe',
    'winlogon.exe',
    'taskhostw.exe',
    'sihost.exe',
    'runtimebroker.exe',
    'searchui.exe',
    'startmenuexperiencehost.exe',
    'shellexperiencehost.exe',
    'textinputhost.exe',
    'securityhealthsystray.exe',
    'securityhealthservice.exe',
    'fontdrvhost.exe',
    'conhost.exe',
    'wmiprvse.exe',
    'searchhost.exe',
    'widgets.exe',
    'smartscreen.exe',
    'applicationframehost.exe',
    'backgroundtaskhost.exe',
    'audiodg.exe',
    'spoolsv.exe',
    'ctfmon.exe',
  ])

  private static isMacUserApp(lowerCommand: string): boolean {
    if (!lowerCommand.includes('.app/contents/macos/') || lowerCommand.startsWith('/system/'))
      return false
    return !['helper', 'widget', 'extension', 'plugin', 'service'].some(tag => lowerCommand.includes(tag))
  }

  private static isLinuxUserApp(lowerName: string, lowerCommand: string): boolean {
    if (lowerName.startsWith('['))
      return false
    if (this.LINUX_SYSTEM_PATHS.some(p => lowerCommand.includes(p)))
      return false
    if (this.LINUX_SYSTEM_DAEMONS.some(d => lowerName === d || lowerCommand.includes(d)))
      return false
    return ['/opt/', '/usr/bin/', '/home/', 'firefox', 'chrome', 'code', 'electron']
      .some(token => lowerCommand.includes(token))
  }

  private static isWindowsUserApp(lowerName: string, lowerCommand: string): boolean {
    if (!lowerCommand.includes('.exe'))
      return false
    if (this.WINDOWS_SYSTEM_PATHS.some(p => lowerCommand.includes(p)))
      return false
    return !this.WINDOWS_SYSTEM_PROCESSES.has(lowerName)
  }

  private static filterUserApplications(processes: ProcessInfo[], platform: Platform): ProcessInfo[] {
    return processes.filter((proc) => {
      const lowerCommand = proc.command.toLowerCase()
      const lowerName = proc.name.toLowerCase()

      if (this.SYSTEM_KEYWORDS.some(kw => lowerCommand.includes(kw) || lowerName.includes(kw)))
        return false
      if (this.EXCLUDE_PATTERNS.some(pat => lowerCommand.includes(pat)))
        return false

      if (platform === 'darwin')
        return this.isMacUserApp(lowerCommand)
      if (platform === 'linux')
        return this.isLinuxUserApp(lowerName, lowerCommand)
      if (platform === 'win32')
        return this.isWindowsUserApp(lowerName, lowerCommand)
      return true
    })
  }

  // ========== Unix/Linux/macOS 实现 ==========

  /**
   * Unix 系统：列出运行中的进程
   */
  private static async listRunningUnix(filter?: string): Promise<ProcessInfo[]> {
    try {
      // 使用 ps aux 命令
      const { stdout } = await execAsync('ps aux')
      return this.parsePS(stdout, filter)
    }
    catch (error) {
      logger.error('Unix 列出进程失败', error)
      return []
    }
  }

  /**
   * Unix 系统：关闭进程
   */
  private static async killUnix(pid: number, force: boolean): Promise<boolean> {
    try {
      // -TERM: 正常终止 (15)
      // -KILL: 强制终止 (9)
      const signal = force ? '-9' : '-15'
      await execAsync(`kill ${signal} ${pid}`)
      logger.info(`Unix: 成功发送信号 ${signal} 到进程 ${pid}`)
      return true
    }
    catch (error) {
      logger.error(`Unix: 关闭进程失败 (PID: ${pid}):`, error)
      return false
    }
  }

  /**
   * 解析 ps aux 命令输出
   */
  private static parsePS(output: string, filter?: string): ProcessInfo[] {
    const processes: ProcessInfo[] = []
    const lines = output.split('\n')

    // 跳过标题行
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line)
        continue

      try {
        // ps aux 输出格式：
        // USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
        const parts = line.split(/\s+/)
        if (parts.length < 11)
          continue

        const pid = Number.parseInt(parts[1], 10)
        const cpu = Number.parseFloat(parts[2])
        const memory = Number.parseFloat(parts[3])
        const command = parts.slice(10).join(' ')

        // 提取进程名称（从命令中）
        const commandParts = command.split(/[\s/]/)
        const name = commandParts[commandParts.length - 1] || command

        // 应用过滤条件
        if (filter) {
          const filterLower = filter.toLowerCase()
          const nameLower = name.toLowerCase()
          const commandLower = command.toLowerCase()

          if (!nameLower.includes(filterLower) && !commandLower.includes(filterLower)) {
            continue
          }
        }

        processes.push({
          pid,
          name,
          command,
          cpu,
          memory,
        })
      }
      catch {
        // 跳过解析失败的行
        continue
      }
    }

    logger.info(`解析 ps 输出: 找到 ${processes.length} 个进程`)
    return processes
  }

  // ========== Windows 实现 ==========

  /**
   * Windows 系统：列出运行中的进程
   */
  private static async listRunningWindows(filter?: string): Promise<ProcessInfo[]> {
    try {
      // 使用 tasklist /V 命令以获取 Window Title / User Name 等扩展信息
      // 注意：tasklist 本身不输出可执行文件路径，command 字段仍为 image name
      const { stdout } = await execAsync('tasklist /V /FO CSV /NH')
      return this.parseTasklist(stdout, filter)
    }
    catch (error) {
      logger.error('Windows 列出进程失败', error)
      return []
    }
  }

  /**
   * Windows 系统：关闭进程
   */
  private static async killWindows(pid: number, force: boolean): Promise<boolean> {
    try {
      // /T: 终止进程树
      // /F: 强制终止
      const forceFlag = force ? '/F /T' : '/T'
      await execAsync(`taskkill /PID ${pid} ${forceFlag}`)
      logger.info(`Windows: 成功关闭进程 ${pid}`)
      return true
    }
    catch (error) {
      logger.error(`Windows: 关闭进程失败 (PID: ${pid}):`, error)
      return false
    }
  }

  /**
   * 解析 tasklist CSV 输出
   *
   * 支持两种格式：
   * - `tasklist /FO CSV /NH`（5 列）：Image Name, PID, Session Name, Session#, Mem Usage
   * - `tasklist /V /FO CSV /NH`（9 列）：额外包含 Status, User Name, CPU Time, Window Title
   *
   * 自动按列数选择解析路径，向后兼容。
   */
  private static parseTasklist(output: string, filter?: string): ProcessInfo[] {
    const processes: ProcessInfo[] = []
    const lines = output.split('\n')

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed)
        continue

      try {
        // CSV 解析：移除两端引号后用 "," 分割，能稳定处理列内的逗号（如 mem usage "123,456 K"）
        const stripped = trimmed.replace(/^"|"$/g, '')
        const parts = stripped.split('","')
        if (parts.length < 2)
          continue

        const name = parts[0]
        const pid = Number.parseInt(parts[1], 10)
        if (Number.isNaN(pid))
          continue

        // command 字段：tasklist 不输出可执行文件路径，仍只能用 image name
        const command = name

        // 解析内存（如果有）
        let memory: number | undefined
        if (parts.length >= 5) {
          const memStr = parts[4].replace(/[,\sK]/g, '')
          const memKB = Number.parseInt(memStr, 10)
          if (!Number.isNaN(memKB)) {
            memory = memKB / 1024 // 转换为 MB
          }
        }

        // /V 输出额外字段：列数 >= 9 时提取 Window Title / User Name
        let windowTitle: string | undefined
        let userName: string | undefined
        if (parts.length >= 9) {
          // parts[5] = Status, parts[6] = User Name, parts[7] = CPU Time, parts[8] = Window Title
          const rawUser = parts[6]?.trim()
          if (rawUser && rawUser !== 'N/A') {
            userName = rawUser
          }
          const rawTitle = parts[8]?.trim()
          if (rawTitle && rawTitle !== 'N/A') {
            windowTitle = rawTitle
          }
        }

        // 应用过滤条件
        if (filter) {
          const filterLower = filter.toLowerCase()
          const nameLower = name.toLowerCase()

          if (!nameLower.includes(filterLower)) {
            continue
          }
        }

        processes.push({
          pid,
          name,
          command,
          memory,
          windowTitle,
          userName,
        })
      }
      catch {
        // 跳过解析失败的行
        continue
      }
    }

    logger.info(`解析 tasklist 输出: 找到 ${processes.length} 个进程`)
    return processes
  }
}
