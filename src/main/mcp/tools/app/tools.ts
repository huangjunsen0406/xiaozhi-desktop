/**
 * 应用管理工具定义
 */

import type { AppInfo } from './types'
import { getLogger } from '../../../utils/logger'
import { PropertyList, PropertyType } from '../../types'
import { defineTool } from '../registry'
import { TimeoutError, withTimeout } from '../util/withTimeout'
import { AppLauncher } from './AppLauncher'
import { AppScanner } from './AppScanner'
import { ProcessManager } from './ProcessManager'

const logger = getLogger('AppTools')

/** scan_installed / list_running 单次调用最长允许耗时，避免永久挂死 */
const APP_TOOL_TIMEOUT_MS = 30_000

/**
 * 启动应用
 */
defineTool({
  name: 'self.application.launch',
  description: `Launch desktop applications and software programs by name. This tool opens applications installed on the user's computer across Windows, macOS, and Linux platforms. It automatically detects the operating system and uses appropriate launch methods.

Use this tool when the user wants to:
1. Open specific software applications (e.g., 'QQ', 'QQ音乐', 'WeChat', '微信')
2. Launch system utilities (e.g., 'Calculator', '计算器', 'Notepad', '记事本')
3. Start browsers (e.g., 'Chrome', 'Firefox', 'Safari')
4. Open media players (e.g., 'VLC', 'Windows Media Player')
5. Launch development tools (e.g., 'VS Code', 'PyCharm')
6. Start games or other installed programs

Examples of valid app names:
- Chinese: 'QQ音乐', '微信', '计算器', '记事本', '浏览器'
- English: 'QQ', 'WeChat', 'Calculator', 'Notepad', 'Chrome'
- Mixed: 'QQ Music', 'Microsoft Word', 'Adobe Photoshop'

The system will try multiple launch strategies including direct execution, system commands, and path searching to find and start the application.`,
  properties: new PropertyList([
    {
      name: 'app_name',
      type: PropertyType.STRING,
    },
  ]),
  callback: async (args: Record<string, unknown>): Promise<string> => {
    try {
      const appName = args.app_name as string

      logger.info(`启动应用: ${appName}`)

      const result = await AppLauncher.launch(appName)

      if (result.success) {
        logger.info(`应用启动成功: ${appName}`)
        return 'true'
      }
      else {
        logger.warn(`应用启动失败: ${result.message}`)
        // 把失败原因带给模型，便于向用户解释（例如路径不存在、平台不支持）
        return `false: ${result.message}`
      }
    }
    catch (error) {
      logger.error('启动应用失败:', error)
      return 'false'
    }
  },
})

/**
 * 列出运行中的应用
 */
defineTool({
  name: 'self.application.list_running',
  description: `List all currently running applications and processes. This tool provides real-time information about active applications on the system, including process IDs, names, and commands.

Use this tool when:
1. User asks what applications are currently running
2. You need to check if a specific application is running before closing it
3. User wants to see active processes or programs
4. Troubleshooting application issues

Parameters:
- filter_name: Optional filter to show only applications containing this name

Returns detailed information about running applications including process IDs which can be useful for targeted application management.`,
  properties: new PropertyList([
    {
      name: 'filter_name',
      type: PropertyType.STRING,
      defaultValue: '',
    },
  ]),
  callback: async (args: Record<string, unknown>): Promise<string> => {
    try {
      const filterName = (args.filter_name as string) || ''

      logger.info(`列出运行中的应用, 过滤: ${filterName}`)

      const processes = await withTimeout(
        ProcessManager.listRunning(filterName),
        APP_TOOL_TIMEOUT_MS,
        'list_running',
      )

      logger.info(`找到 ${processes.length} 个进程`)

      const result = {
        success: true,
        total_count: processes.length,
        applications: processes.map(proc => ({
          pid: proc.pid,
          name: proc.name,
          command: proc.command,
          cpu: proc.cpu,
          memory: proc.memory,
        })),
        message: `找到 ${processes.length} 个正在运行的应用程序`,
      }

      return JSON.stringify(result, null, 2)
    }
    catch (error) {
      if (error instanceof TimeoutError) {
        logger.warn('list_running 超时（30秒）')
        const timeoutResult = {
          success: false,
          total_count: 0,
          applications: [],
          message: '扫描超时（30秒）',
        }
        return JSON.stringify(timeoutResult, null, 2)
      }
      logger.error('列出运行应用失败:', error)
      const errorResult = {
        success: false,
        total_count: 0,
        applications: [],
        message: `列出运行应用失败: ${error}`,
      }
      return JSON.stringify(errorResult, null, 2)
    }
  },
})

/**
 * 关闭应用
 */
defineTool({
  name: 'self.application.kill',
  description: `Close or terminate running applications by name. This tool can gracefully close applications or force-kill them if needed. It automatically finds running processes matching the application name and terminates them.

Use this tool when:
1. User asks to close, quit, or exit an application
2. User wants to stop or terminate a running program
3. Application is unresponsive and needs to be force-closed
4. User says 'close QQ', 'quit Chrome', 'stop music player', etc.

Parameters:
- app_name: Name of the application to close (e.g., 'QQ', 'Chrome', 'Calculator')
- force: Set to true for force-kill unresponsive applications (default: false)

The tool will find all running processes matching the application name and attempt to close them gracefully. If force=true, it will use system kill commands to immediately terminate the processes.`,
  properties: new PropertyList([
    {
      name: 'app_name',
      type: PropertyType.STRING,
    },
    {
      name: 'force',
      type: PropertyType.BOOLEAN,
      defaultValue: false,
    },
  ]),
  callback: async (args: Record<string, unknown>): Promise<string> => {
    try {
      const appName = args.app_name as string
      const force = (args.force as boolean) || false

      logger.info(`关闭应用: ${appName}, 强制: ${force}`)

      const killedCount = await ProcessManager.killByName(appName, force)

      if (killedCount > 0) {
        logger.info(`成功关闭 ${killedCount} 个进程`)
        return 'true'
      }
      else {
        logger.warn(`未找到或关闭失败: ${appName}`)
        return 'false'
      }
    }
    catch (error) {
      logger.error('关闭应用失败:', error)
      return 'false'
    }
  },
})

/**
 * 扫描已安装的应用
 */
defineTool({
  name: 'self.application.scan_installed',
  description: `Scan and list all installed applications on the system. This tool discovers applications across different installation locations and provides a comprehensive inventory of available software.

Use this tool when:
1. User asks what applications are installed on the system
2. User wants to see available programs or software
3. You need to verify if a specific application is installed before trying to launch it
4. User asks "what can I open?", "what programs do I have?", "show installed apps"

Parameters:
- force_refresh: Set to true to bypass cache and force a fresh scan (default: false)
- search_query: Optional search term to filter results (searches both name and display name)

The tool automatically:
- Scans platform-specific application directories (Applications folder on macOS, Start Menu on Windows, .desktop files on Linux)
- Includes common system utilities and tools
- Caches results for 5 minutes to improve performance
- Returns application names, display names, paths, and types

Returns JSON with application details including name (for launching), displayName (for display), path (installation location), and type (application/system/user_application).`,
  properties: new PropertyList([
    {
      name: 'force_refresh',
      type: PropertyType.BOOLEAN,
      defaultValue: false,
    },
    {
      name: 'search_query',
      type: PropertyType.STRING,
      defaultValue: '',
    },
  ]),
  callback: async (args: Record<string, unknown>): Promise<string> => {
    try {
      const forceRefresh = (args.force_refresh as boolean) || false
      const searchQuery = (args.search_query as string) || ''

      logger.info(`扫描已安装应用, 强制刷新: ${forceRefresh}, 搜索: ${searchQuery}`)

      let apps: AppInfo[]

      if (searchQuery) {
        apps = await withTimeout(
          AppScanner.search(searchQuery),
          APP_TOOL_TIMEOUT_MS,
          'scan_installed:search',
        )
        logger.info(`搜索到 ${apps.length} 个匹配的应用`)
      }
      else {
        apps = await withTimeout(
          AppScanner.scanInstalled(forceRefresh),
          APP_TOOL_TIMEOUT_MS,
          'scan_installed',
        )
        logger.info(`扫描到 ${apps.length} 个已安装应用`)
      }

      const result = {
        success: true,
        total_count: apps.length,
        platform: AppScanner.getPlatform(),
        applications: apps.map(app => ({
          name: app.name,
          displayName: app.displayName,
          path: app.path,
          type: app.type,
        })),
        message: searchQuery
          ? `找到 ${apps.length} 个匹配 "${searchQuery}" 的应用`
          : `找到 ${apps.length} 个已安装的应用程序`,
      }

      return JSON.stringify(result, null, 2)
    }
    catch (error) {
      if (error instanceof TimeoutError) {
        logger.warn('scan_installed 超时（30秒）')
        const timeoutResult = {
          success: false,
          total_count: 0,
          platform: AppScanner.getPlatform(),
          applications: [],
          message: '扫描超时（30秒）',
        }
        return JSON.stringify(timeoutResult, null, 2)
      }
      logger.error('扫描应用失败:', error)
      const errorResult = {
        success: false,
        total_count: 0,
        platform: AppScanner.getPlatform(),
        applications: [],
        message: `扫描应用失败: ${error}`,
      }
      return JSON.stringify(errorResult, null, 2)
    }
  },
})
