import type { Platform, ProcessInfo } from './types'
/**
 * 跨平台进程管理器
 * 负责列出和关闭系统进程
 */
import { exec } from 'node:child_process'
import * as os from 'node:os'
import { promisify } from 'node:util'

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

    console.log(`[ProcessManager] 列出运行进程, 平台: ${platform}, 过滤: ${filter || '无'}`)

    try {
      let processes: ProcessInfo[] = []

      if (platform === 'darwin' || platform === 'linux') {
        processes = await this.listRunningUnix(filter)
      }
      else if (platform === 'win32') {
        processes = await this.listRunningWindows(filter)
      }
      else {
        console.error(`[ProcessManager] 不支持的平台: ${platform}`)
        return []
      }

      // 如果不包含系统进程，则过滤掉
      if (!includeSystemProcesses) {
        processes = this.filterUserApplications(processes, platform)
        console.log(`[ProcessManager] 过滤后剩余 ${processes.length} 个用户应用`)
      }

      return processes
    }
    catch (error) {
      console.error('[ProcessManager] 列出进程失败:', error)
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

    console.log(`[ProcessManager] 关闭进程: PID=${pid}, 强制=${force}, 平台=${platform}`)

    try {
      if (platform === 'darwin' || platform === 'linux') {
        return await this.killUnix(pid, force)
      }
      else if (platform === 'win32') {
        return await this.killWindows(pid, force)
      }
      else {
        console.error(`[ProcessManager] 不支持的平台: ${platform}`)
        return false
      }
    }
    catch (error) {
      console.error('[ProcessManager] 关闭进程失败:', error)
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
    console.log(`[ProcessManager] 根据名称关闭应用: ${appName}, 强制=${force}`)

    try {
      // 1. 列出所有匹配的进程（包括系统进程，因为用户可能想关闭它们）
      const processes = await this.listRunning(appName, true)

      if (processes.length === 0) {
        console.warn(`[ProcessManager] 未找到运行中的应用: ${appName}`)
        return 0
      }

      console.log(`[ProcessManager] 找到 ${processes.length} 个匹配的进程`)

      // 2. 逐个关闭进程
      let successCount = 0
      for (const proc of processes) {
        const success = await this.kill(proc.pid, force)
        if (success) {
          successCount++
          console.log(`[ProcessManager] 成功关闭进程: ${proc.name} (PID: ${proc.pid})`)
        }
        else {
          console.warn(`[ProcessManager] 关闭进程失败: ${proc.name} (PID: ${proc.pid})`)
        }
      }

      console.log(`[ProcessManager] 关闭操作完成: ${successCount}/${processes.length}`)
      return successCount
    }
    catch (error) {
      console.error('[ProcessManager] 根据名称关闭应用失败:', error)
      return 0
    }
  }

  // ========== Unix/Linux/macOS 实现 ==========

  /**
   * 过滤用户应用程序（排除系统进程）
   */
  private static filterUserApplications(processes: ProcessInfo[], platform: Platform): ProcessInfo[] {
    // 系统进程关键词黑名单
    const systemKeywords = [
      // macOS 系统进程
      'com.apple.',
      'mdworker',
      'kernel_task',
      'launchd',
      'UserEventAgent',
      'cfprefsd',
      'CommCenter',
      'WindowServer',
      'Dock',
      'Finder',
      'loginwindow',
      'SystemUIServer',
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
      // Chrome/Electron Helper 进程
      'Helper (Renderer)',
      'Helper (GPU)',
      'Helper (Plugin)',
      'Helper',
      // 通用系统进程
      'systemd',
      'dbus',
      'Xorg',
      'kworker',
    ]

    // macOS 排除的路径和扩展
    const excludePatterns = [
      '.appex/', // 应用扩展
      'PlugIns/', // 插件
      'XPCServices/', // XPC 服务
      'Frameworks/', // 框架（通常是子进程）
      '/System/Library/CoreServices/', // 系统核心服务
      '/System/Library/PrivateFrameworks/', // 系统私有框架
      'WidgetExtension', // 小组件
      'Extension.appex', // 扩展
      'lsp_server', // LSP 服务器
      'lsp_runner', // LSP 运行器
      '.venv/bin/', // Python 虚拟环境
      '.vscode/extensions/', // VSCode 扩展
      'node_modules/', // Node 模块（排除开发工具）
      'AppleLanguages', // 系统语言服务
      '--seatbelt-client', // 沙盒客户端
      'LoginItems/', // 登录项
    ]

    return processes.filter((proc) => {
      const lowerCommand = proc.command.toLowerCase()
      const lowerName = proc.name.toLowerCase()

      // 检查是否包含系统进程关键词
      for (const keyword of systemKeywords) {
        if (lowerCommand.includes(keyword.toLowerCase()) || lowerName.includes(keyword.toLowerCase())) {
          return false
        }
      }

      // 检查排除模式
      for (const pattern of excludePatterns) {
        if (lowerCommand.includes(pattern.toLowerCase())) {
          return false
        }
      }

      // macOS: 只保留主应用程序
      if (platform === 'darwin') {
        // 必须包含 .app/Contents/MacOS/
        if (!lowerCommand.includes('.app/contents/macos/'))
          return false

        // 排除系统应用路径
        if (lowerCommand.startsWith('/system/'))
          return false

        // 必须是主应用程序（不是 Helper、Widget 等）
        if (lowerCommand.includes('helper')
          || lowerCommand.includes('widget')
          || lowerCommand.includes('extension')
          || lowerCommand.includes('plugin')
          || lowerCommand.includes('service')) {
          return false
        }

        return true
      }

      // Linux: 保留用户级应用程序
      if (platform === 'linux') {
        // 排除内核进程
        if (lowerName.startsWith('['))
          return false

        // 排除系统守护进程和服务
        const linuxSystemPaths = [
          '/lib/systemd/',
          '/usr/lib/systemd/',
          '/usr/libexec/',
          '/usr/sbin/',
          '/sbin/',
        ]

        for (const systemPath of linuxSystemPaths) {
          if (lowerCommand.includes(systemPath))
            return false
        }

        // 排除常见系统守护进程
        const linuxSystemDaemons = [
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

        for (const daemon of linuxSystemDaemons) {
          if (lowerName === daemon || lowerCommand.includes(daemon))
            return false
        }

        // 只保留常见用户应用（通常在 /usr/bin/ 或 /opt/ 或用户目录）
        // 或者是明确的图形界面应用
        if (lowerCommand.includes('/opt/')
          || lowerCommand.includes('/usr/bin/')
          || lowerCommand.includes('/home/')
          || lowerCommand.includes('firefox')
          || lowerCommand.includes('chrome')
          || lowerCommand.includes('code')
          || lowerCommand.includes('electron')) {
          return true
        }

        return false
      }

      // Windows: 保留用户应用程序
      if (platform === 'win32') {
        // 必须包含 .exe
        if (!lowerCommand.includes('.exe'))
          return false

        // 排除 Windows 系统进程路径
        const windowsSystemPaths = [
          'c:\\windows\\system32\\',
          'c:\\windows\\syswow64\\',
          'c:\\windows\\explorer.exe',
        ]

        for (const systemPath of windowsSystemPaths) {
          if (lowerCommand.includes(systemPath))
            return false
        }

        // 排除常见系统进程
        const windowsSystemProcesses = [
          'svchost.exe',
          'dwm.exe',
          'csrss.exe',
          'wininit.exe',
          'services.exe',
          'lsass.exe',
          'winlogon.exe',
          'taskhostw.exe',
          'sihost.exe',
          'RuntimeBroker.exe',
          'SearchUI.exe',
          'StartMenuExperienceHost.exe',
          'ShellExperienceHost.exe',
          'TextInputHost.exe',
          'SecurityHealthSystray.exe',
          'SecurityHealthService.exe',
        ]

        for (const sysProc of windowsSystemProcesses) {
          if (lowerName === sysProc.toLowerCase())
            return false
        }

        // 只保留用户应用路径
        if (lowerCommand.includes('\\program files\\')
          || lowerCommand.includes('\\program files (x86)\\')
          || lowerCommand.includes('\\users\\')
          || lowerCommand.includes('\\appdata\\')) {
          return true
        }

        return false
      }

      return true
    })
  }

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
      console.error('[ProcessManager] Unix 列出进程失败:', error)
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
      console.log(`[ProcessManager] Unix: 成功发送信号 ${signal} 到进程 ${pid}`)
      return true
    }
    catch (error) {
      console.error(`[ProcessManager] Unix: 关闭进程失败 (PID: ${pid}):`, error)
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

    console.log(`[ProcessManager] 解析 ps 输出: 找到 ${processes.length} 个进程`)
    return processes
  }

  // ========== Windows 实现 ==========

  /**
   * Windows 系统：列出运行中的进程
   */
  private static async listRunningWindows(filter?: string): Promise<ProcessInfo[]> {
    try {
      // 使用 tasklist 命令
      const { stdout } = await execAsync('tasklist /FO CSV /NH')
      return this.parseTasklist(stdout, filter)
    }
    catch (error) {
      console.error('[ProcessManager] Windows 列出进程失败:', error)
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
      console.log(`[ProcessManager] Windows: 成功关闭进程 ${pid}`)
      return true
    }
    catch (error) {
      console.error(`[ProcessManager] Windows: 关闭进程失败 (PID: ${pid}):`, error)
      return false
    }
  }

  /**
   * 解析 tasklist CSV 输出
   */
  private static parseTasklist(output: string, filter?: string): ProcessInfo[] {
    const processes: ProcessInfo[] = []
    const lines = output.split('\n')

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed)
        continue

      try {
        // CSV 格式：
        // "Image Name","PID","Session Name","Session#","Mem Usage"
        // "chrome.exe","1234","Console","1","123,456 K"

        // 移除引号并分割
        const parts = trimmed.split('","').map(part => part.replace(/"/g, ''))
        if (parts.length < 2)
          continue

        const name = parts[0]
        const pid = Number.parseInt(parts[1], 10)
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
        })
      }
      catch {
        // 跳过解析失败的行
        continue
      }
    }

    console.log(`[ProcessManager] 解析 tasklist 输出: 找到 ${processes.length} 个进程`)
    return processes
  }
}
