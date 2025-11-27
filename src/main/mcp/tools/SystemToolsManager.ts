import type OpenAI from 'openai'
import type { ChatPlugin } from '../../plugins/ChatPlugin'
import type { PropertyList, PropertyType } from '../types'
import { Buffer } from 'node:buffer'
import { getApplication } from '../../services/Application'
import { DatabaseManager } from '../../services/database'
import { SystemVolumeController } from '../../utils/SystemVolumeController'
import { McpServer } from '../McpServer'
import { AppLauncher } from './app/AppLauncher'
import { AppScanner } from './app/AppScanner'
import { ProcessManager } from './app/ProcessManager'
import { ScreenshotTool } from './screenshot'
/**
 * 系统工具管理器
 * 负责注册系统相关的 MCP 工具（音量控制、应用管理等）
 */
export class SystemToolsManager {
  private static instance: SystemToolsManager | null = null
  private initialized = false
  private volumeController = new SystemVolumeController()

  private constructor() {
    console.log('[SystemToolsManager] 系统工具管理器初始化')
  }

  static getInstance(): SystemToolsManager {
    if (!SystemToolsManager.instance) {
      SystemToolsManager.instance = new SystemToolsManager()
    }
    return SystemToolsManager.instance
  }

  /**
   * 初始化并注册所有系统工具
   * @param addTool - MCP Server 的 addTool 方法
   * @param PropertyListClass - 属性列表类
   * @param PropertyTypeEnum - 属性类型枚举
   */
  init(
    addTool: (name: string, description: string, properties: PropertyList, callback: (args: Record<string, unknown>) => Promise<string>) => void,
    PropertyListClass: typeof PropertyList,
    PropertyTypeEnum: typeof PropertyType,
  ): void {
    try {
      console.log('[SystemToolsManager] 开始注册系统工具')

      // 注册音量控制工具
      this.registerVolumeControl(addTool, PropertyListClass, PropertyTypeEnum)

      // 注册音量获取工具
      this.registerVolumeGet(addTool, PropertyListClass, PropertyTypeEnum)

      // 注册应用程序启动工具
      this.registerAppLauncher(addTool, PropertyListClass, PropertyTypeEnum)

      // 注册进程列表工具
      this.registerProcessList(addTool, PropertyListClass, PropertyTypeEnum)

      // 注册应用程序关闭工具
      this.registerAppKiller(addTool, PropertyListClass, PropertyTypeEnum)

      // 注册应用程序扫描工具
      this.registerAppScanner(addTool, PropertyListClass, PropertyTypeEnum)

      // 注册摄像头工具
      this.registerCamera(addTool, PropertyListClass, PropertyTypeEnum)

      // 注册截图工具
      this.registerScreenshot(addTool, PropertyListClass, PropertyTypeEnum)

      // 注册主题控制工具
      this.registerThemeControl(addTool, PropertyListClass, PropertyTypeEnum)

      // 注册主题获取工具
      this.registerThemeGet(addTool, PropertyListClass, PropertyTypeEnum)

      // 注册系统信息工具
      this.registerSystemInfo(addTool, PropertyListClass, PropertyTypeEnum)

      this.initialized = true
      console.log('[SystemToolsManager] 系统工具注册完成')
    }
    catch (error) {
      console.error('[SystemToolsManager] 系统工具注册失败:', error)
      throw error
    }
  }

  /**
   * 注册音量控制工具
   */
  private registerVolumeControl(
    addTool: (name: string, description: string, properties: PropertyList, callback: (args: Record<string, unknown>) => Promise<string>) => void,
    PropertyListClass: typeof PropertyList,
    PropertyTypeEnum: typeof PropertyType,
  ): void {
    const volumeProps = new PropertyListClass([
      {
        name: 'volume',
        type: PropertyTypeEnum.INTEGER,
        minValue: 0,
        maxValue: 100,
      },
    ])

    const description = `Set the system speaker volume to an absolute value (0-100).
Use when user mentions: volume, sound, louder, quieter, mute, unmute, adjust volume.
Examples: 'set volume to 50', 'turn volume up', 'make it louder', 'mute', '音量设为50', '调大声音', '声音小一点', '静音'.
Parameter:
- volume: Integer (0-100) representing the target volume level. Set to 0 for mute.`

    addTool(
      'self.audio_speaker.set_volume',
      description,
      volumeProps,
      async (args: Record<string, unknown>): Promise<string> => {
        return await this.setVolume(args)
      },
    )

    console.log('[SystemToolsManager] 注册音量控制工具成功')
  }

  /**
   * 注册音量获取工具
   */
  private registerVolumeGet(
    addTool: (name: string, description: string, properties: PropertyList, callback: (args: Record<string, unknown>) => Promise<string>) => void,
    PropertyListClass: typeof PropertyList,
    _PropertyTypeEnum: typeof PropertyType,
  ): void {
    const getVolumeProps = new PropertyListClass([])

    const description = `Get the current system speaker volume level.
Use when user asks about: current volume, volume level, how loud, what's the volume.
Examples: 'what is the current volume?', 'how loud is it?', 'check volume level', '现在音量多少?', '查看音量', '音量是多少'.
Returns:
- Integer (0-100) representing the current volume level.`

    addTool(
      'self.audio_speaker.get_volume',
      description,
      getVolumeProps,
      async (args: Record<string, unknown>): Promise<string> => {
        return await this.getVolume(args)
      },
    )

    console.log('[SystemToolsManager] 注册音量获取工具成功')
  }

  /**
   * 注册应用程序启动工具
   */
  private registerAppLauncher(
    addTool: (name: string, description: string, properties: PropertyList, callback: (args: Record<string, unknown>) => Promise<string>) => void,
    PropertyListClass: typeof PropertyList,
    PropertyTypeEnum: typeof PropertyType,
  ): void {
    const appProps = new PropertyListClass([
      {
        name: 'app_name',
        type: PropertyTypeEnum.STRING,
      },
    ])

    const description = `Launch desktop applications and software programs by name. This tool opens applications installed on the user's computer across Windows, macOS, and Linux platforms. It automatically detects the operating system and uses appropriate launch methods.

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

The system will try multiple launch strategies including direct execution, system commands, and path searching to find and start the application.`

    addTool(
      'self.application.launch',
      description,
      appProps,
      async (args: Record<string, unknown>): Promise<string> => {
        return await this.launchApp(args)
      },
    )

    console.log('[SystemToolsManager] 注册应用启动工具成功')
  }

  /**
   * 注册进程列表工具
   */
  private registerProcessList(
    addTool: (name: string, description: string, properties: PropertyList, callback: (args: Record<string, unknown>) => Promise<string>) => void,
    PropertyListClass: typeof PropertyList,
    PropertyTypeEnum: typeof PropertyType,
  ): void {
    const listProps = new PropertyListClass([
      {
        name: 'filter_name',
        type: PropertyTypeEnum.STRING,
        defaultValue: '',
      },
    ])

    const description = `List all currently running applications and processes. This tool provides real-time information about active applications on the system, including process IDs, names, and commands.

Use this tool when:
1. User asks what applications are currently running
2. You need to check if a specific application is running before closing it
3. User wants to see active processes or programs
4. Troubleshooting application issues

Parameters:
- filter_name: Optional filter to show only applications containing this name

Returns detailed information about running applications including process IDs which can be useful for targeted application management.`

    addTool(
      'self.application.list_running',
      description,
      listProps,
      async (args: Record<string, unknown>): Promise<string> => {
        return await this.listRunningApps(args)
      },
    )

    console.log('[SystemToolsManager] 注册进程列表工具成功')
  }

  /**
   * 注册应用程序关闭工具
   */
  private registerAppKiller(
    addTool: (name: string, description: string, properties: PropertyList, callback: (args: Record<string, unknown>) => Promise<string>) => void,
    PropertyListClass: typeof PropertyList,
    PropertyTypeEnum: typeof PropertyType,
  ): void {
    const killerProps = new PropertyListClass([
      {
        name: 'app_name',
        type: PropertyTypeEnum.STRING,
      },
      {
        name: 'force',
        type: PropertyTypeEnum.BOOLEAN,
        defaultValue: false,
      },
    ])

    const description = `Close or terminate running applications by name. This tool can gracefully close applications or force-kill them if needed. It automatically finds running processes matching the application name and terminates them.

Use this tool when:
1. User asks to close, quit, or exit an application
2. User wants to stop or terminate a running program
3. Application is unresponsive and needs to be force-closed
4. User says 'close QQ', 'quit Chrome', 'stop music player', etc.

Parameters:
- app_name: Name of the application to close (e.g., 'QQ', 'Chrome', 'Calculator')
- force: Set to true for force-kill unresponsive applications (default: false)

The tool will find all running processes matching the application name and attempt to close them gracefully. If force=true, it will use system kill commands to immediately terminate the processes.`

    addTool(
      'self.application.kill',
      description,
      killerProps,
      async (args: Record<string, unknown>): Promise<string> => {
        return await this.killApp(args)
      },
    )

    console.log('[SystemToolsManager] 注册应用关闭工具成功')
  }

  /**
   * 注册应用程序扫描工具
   */
  private registerAppScanner(
    addTool: (name: string, description: string, properties: PropertyList, callback: (args: Record<string, unknown>) => Promise<string>) => void,
    PropertyListClass: typeof PropertyList,
    PropertyTypeEnum: typeof PropertyType,
  ): void {
    const scannerProps = new PropertyListClass([
      {
        name: 'force_refresh',
        type: PropertyTypeEnum.BOOLEAN,
        defaultValue: false,
      },
      {
        name: 'search_query',
        type: PropertyTypeEnum.STRING,
        defaultValue: '',
      },
    ])

    const description = `Scan and list all installed applications on the system. This tool discovers applications across different installation locations and provides a comprehensive inventory of available software.

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

Returns JSON with application details including name (for launching), displayName (for display), path (installation location), and type (application/system/user_application).`

    addTool(
      'self.application.scan_installed',
      description,
      scannerProps,
      async (args: Record<string, unknown>): Promise<string> => {
        return await this.scanInstalledApps(args)
      },
    )

    console.log('[SystemToolsManager] 注册应用扫描工具成功')
  }

  /**
   * 设置音量（工具实现）
   */
  private async setVolume(args: Record<string, unknown>): Promise<string> {
    try {
      const volume = args.volume as number

      console.log(`[SystemToolsManager] 设置音量到 ${volume}`)

      // 验证音量范围
      if (volume < 0 || volume > 100) {
        console.warn(`[SystemToolsManager] 音量值超出范围: ${volume}`)
        return 'false'
      }

      // 使用 SystemVolumeController 设置音量
      await this.volumeController.setVolume(volume)
      console.log(`[SystemToolsManager] 音量设置成功: ${volume}`)
      return 'true'
    }
    catch (error) {
      console.error('[SystemToolsManager] 设置音量失败:', error)
      return 'false'
    }
  }

  /**
   * 获取音量（工具实现）
   */
  private async getVolume(_args: Record<string, unknown>): Promise<string> {
    try {
      console.log('[SystemToolsManager] 获取当前音量')

      // 使用 SystemVolumeController 获取音量
      const currentVolume = await this.volumeController.getVolume()
      console.log(`[SystemToolsManager] 当前音量: ${currentVolume}`)
      return String(currentVolume)
    }
    catch (error) {
      console.error('[SystemToolsManager] 获取音量失败:', error)
      return '70' // 默认值
    }
  }

  /**
   * 启动应用（工具实现）
   */
  private async launchApp(args: Record<string, unknown>): Promise<string> {
    try {
      const appName = args.app_name as string

      console.log(`[SystemToolsManager] 启动应用: ${appName}`)

      // 使用 AppLauncher 启动应用
      const result = await AppLauncher.launch(appName)

      if (result.success) {
        console.log(`[SystemToolsManager] 应用启动成功: ${appName}`)
        return 'true'
      }
      else {
        console.warn(`[SystemToolsManager] 应用启动失败: ${result.message}`)
        return 'false'
      }
    }
    catch (error) {
      console.error('[SystemToolsManager] 启动应用失败:', error)
      return 'false'
    }
  }

  /**
   * 列出运行中的应用（工具实现）
   */
  private async listRunningApps(args: Record<string, unknown>): Promise<string> {
    try {
      const filterName = (args.filter_name as string) || ''

      console.log(`[SystemToolsManager] 列出运行中的应用, 过滤: ${filterName}`)

      // 使用 ProcessManager 列出进程
      const processes = await ProcessManager.listRunning(filterName)

      console.log(`[SystemToolsManager] 找到 ${processes.length} 个进程`)

      // 格式化返回结果（JSON 字符串）
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
      console.error('[SystemToolsManager] 列出运行应用失败:', error)
      const errorResult = {
        success: false,
        total_count: 0,
        applications: [],
        message: `列出运行应用失败: ${error}`,
      }
      return JSON.stringify(errorResult, null, 2)
    }
  }

  /**
   * 关闭应用（工具实现）
   */
  private async killApp(args: Record<string, unknown>): Promise<string> {
    try {
      const appName = args.app_name as string
      const force = (args.force as boolean) || false

      console.log(`[SystemToolsManager] 关闭应用: ${appName}, 强制: ${force}`)

      // 使用 ProcessManager 关闭进程
      const killedCount = await ProcessManager.killByName(appName, force)

      if (killedCount > 0) {
        console.log(`[SystemToolsManager] 成功关闭 ${killedCount} 个进程`)
        return 'true'
      }
      else {
        console.warn(`[SystemToolsManager] 未找到或关闭失败: ${appName}`)
        return 'false'
      }
    }
    catch (error) {
      console.error('[SystemToolsManager] 关闭应用失败:', error)
      return 'false'
    }
  }

  /**
   * 扫描已安装的应用（工具实现）
   */
  private async scanInstalledApps(args: Record<string, unknown>): Promise<string> {
    try {
      const forceRefresh = (args.force_refresh as boolean) || false
      const searchQuery = (args.search_query as string) || ''

      console.log(`[SystemToolsManager] 扫描已安装应用, 强制刷新: ${forceRefresh}, 搜索: ${searchQuery}`)

      let apps

      // 如果有搜索条件，使用搜索方法
      if (searchQuery) {
        apps = await AppScanner.search(searchQuery)
        console.log(`[SystemToolsManager] 搜索到 ${apps.length} 个匹配的应用`)
      }
      else {
        // 否则扫描所有应用
        apps = await AppScanner.scanInstalled(forceRefresh)
        console.log(`[SystemToolsManager] 扫描到 ${apps.length} 个已安装应用`)
      }

      // 格式化返回结果（JSON 字符串）
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
      console.error('[SystemToolsManager] 扫描应用失败:', error)
      const errorResult = {
        success: false,
        total_count: 0,
        platform: AppScanner.getPlatform(),
        applications: [],
        message: `扫描应用失败: ${error}`,
      }
      return JSON.stringify(errorResult, null, 2)
    }
  }

  /**
   * 注册摄像头工具
   */
  private registerCamera(
    addTool: (name: string, description: string, properties: PropertyList, callback: (args: Record<string, unknown>) => Promise<string>) => void,
    PropertyListClass: typeof PropertyList,
    PropertyTypeEnum: typeof PropertyType,
  ): void {
    const cameraProps = new PropertyListClass([
      {
        name: 'question',
        type: PropertyTypeEnum.STRING,
        defaultValue: '',
      },
    ])

    const description = `Take a photo using the system camera and analyze it with vision AI. This tool captures an image from the user's webcam and can answer questions about what's in the image.

Use this tool when:
1. User asks to take a photo or picture
2. User wants to see what's in front of the camera
3. User asks questions like "what do you see?", "take a photo", "看看我"
4. User wants visual analysis or image recognition

Parameters:
- question: Optional question about the image (e.g., "What's in this image?", "图中有什么?")
  If empty, will provide a general description of the image.

The tool will:
1. Request camera permission if needed
2. Capture a single frame from the webcam
3. Analyze the image using vision AI
4. Return a description or answer to the question

Examples:
- "拍张照" -> Takes photo and describes what's seen
- "看看我现在在哪里" -> Takes photo and describes the location/scene
- "帮我看看这是什么" -> Takes photo and identifies objects`

    addTool(
      'self.camera.take_photo',
      description,
      cameraProps,
      async (args: Record<string, unknown>): Promise<string> => {
        return await this.takePhoto(args)
      },
    )

    console.log('[SystemToolsManager] 注册摄像头工具成功')
  }

  /**
   * 注册截图工具
   */
  private registerScreenshot(
    addTool: (name: string, description: string, properties: PropertyList, callback: (args: Record<string, unknown>) => Promise<string>) => void,
    PropertyListClass: typeof PropertyList,
    PropertyTypeEnum: typeof PropertyType,
  ): void {
    const screenshotProps = new PropertyListClass([
      {
        name: 'question',
        type: PropertyTypeEnum.STRING,
        defaultValue: '',
      },
      {
        name: 'display',
        type: PropertyTypeEnum.STRING,
        defaultValue: '',
      },
    ])

    const description = `Take a screenshot of the desktop and analyze it with vision AI. This tool captures the current screen content and can answer questions about what's displayed.

Use this tool when:
1. User asks to take a screenshot or capture the screen
2. User wants to know what's on their screen
3. User asks questions like "what's on my screen?", "screenshot", "截个屏", "看看我的屏幕"
4. User wants to analyze or describe screen content

Parameters:
- question: Optional question about the screenshot (e.g., "What's on the screen?", "屏幕上有什么?")
  If empty, will provide a general description of the screen content.
- display: Optional display selection (default: all displays)
  - "main" or "主屏": Main/primary display only
  - "secondary" or "副屏": Secondary display only
  - "1", "2", "3"...: Specific display number
  - Empty or omitted: Capture all displays

The tool will:
1. Capture the specified display(s)
2. Analyze the image using vision AI
3. Return a description or answer to the question

Examples:
- "截个屏" -> Takes screenshot of all displays and describes what's shown
- "看看我主屏上有什么" -> Screenshots main display only and describes content
- "帮我看看第二个屏幕显示的是什么" -> Screenshots secondary display and analyzes it`

    addTool(
      'self.screenshot.take',
      description,
      screenshotProps,
      async (args: Record<string, unknown>): Promise<string> => {
        return await this.takeScreenshot(args)
      },
    )

    console.log('[SystemToolsManager] 注册截图工具成功')
  }

  /**
   * 拍照并分析（工具实现）
   */
  private async takePhoto(args: Record<string, unknown>): Promise<string> {
    try {
      const question = (args.question as string) || ''

      console.log(`[SystemToolsManager] 拍照, 问题: ${question}`)

      // 从数据库获取摄像头配置
      const db = DatabaseManager.getInstance()
      const cameraConfig = db.getFormattedCameraConfig()

      const cameraOptions = {
        // 如果本地配置了 VL API，则使用本地配置
        vlApiKey: cameraConfig.useLocalVision ? cameraConfig.vlApiKey : '',
        vlUrl: cameraConfig.useLocalVision ? cameraConfig.vlUrl : '',
        vlModel: cameraConfig.vlModel || 'glm-4v-plus',
        // explainUrl 和 explainToken 会在 MCP 初始化时设置到 Camera 实例
        deviceId: cameraConfig.deviceId || '',
        clientId: '', // TODO: 从网络配置读取
      }

      console.log(`[SystemToolsManager] 摄像头配置:`, {
        useLocalVision: cameraConfig.useLocalVision,
        hasVlUrl: !!cameraOptions.vlUrl,
      })

      // 获取摄像头实例并拍照
      const { getCameraInstance } = await import('./camera')
      const camera = getCameraInstance(cameraOptions)
      const captureResult = await camera.capture()

      if (captureResult.success && captureResult.data) {
        // 广播图片到渲染进程（用于 ChatView 显示）
        const imageBase64 = captureResult.data.toString('base64')
        const mcpServer = McpServer.getInstance()
        mcpServer.broadcastImage(imageBase64, 'camera')
        console.log('[SystemToolsManager] 已广播摄像头图片')

        // 保存图片到数据库
        const app = getApplication()
        const chatPlugin = app.getPluginManager().getPlugin<ChatPlugin>('ChatPlugin')
        await chatPlugin?.saveImage(imageBase64, 'camera')
      }

      // 分析图片
      const analyzeResult = await camera.analyze(question)
      console.log(`[SystemToolsManager] 拍照完成`)
      return JSON.stringify(analyzeResult)
    }
    catch (error) {
      console.error('[SystemToolsManager] 拍照失败:', error)
      return JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : '拍照失败',
      })
    }
  }

  /**
   * 截图并分析（工具实现）
   */
  private async takeScreenshot(args: Record<string, unknown>): Promise<string> {
    try {
      const question = (args.question as string) || ''
      const display = (args.display as string) || null

      console.log(`[SystemToolsManager] 截图, 问题: ${question}, 显示器: ${display}`)

      // 获取截图工具实例
      const screenshotTool = ScreenshotTool.getInstance()

      // 截取屏幕
      const result = await screenshotTool.capture({ display })

      if (!result.success || !result.base64) {
        console.error('[SystemToolsManager] 截图失败:', result.message)
        return JSON.stringify({
          success: false,
          message: result.message || '截图失败',
        })
      }

      console.log('[SystemToolsManager] 截图成功，开始分析...')

      // 从 MCP Server 获取 vision 配置
      const mcpServer = McpServer.getInstance()

      // 通过 McpServer 回调广播截图到渲染进程（用于 ChatView 显示）
      mcpServer.broadcastImage(result.base64, 'screenshot')

      // 保存图片到数据库
      const app = getApplication()
      const chatPlugin = app.getPluginManager().getPlugin<ChatPlugin>('ChatPlugin')
      await chatPlugin?.saveImage(result.base64, 'screenshot')

      const visionConfig = mcpServer.getVisionConfig()

      // 从数据库获取摄像头配置（复用 VL 配置）
      const db = DatabaseManager.getInstance()
      const cameraConfig = db.getFormattedCameraConfig()

      // 构建分析请求
      const useLocalVision = cameraConfig.useLocalVision
      let analysisResult: string

      if (useLocalVision && cameraConfig.vlApiKey && cameraConfig.vlUrl) {
        // 使用本地 VL API 分析
        console.log('[SystemToolsManager] 使用本地 VL API 分析截图')
        analysisResult = await this.analyzeImageWithLocalVL(
          result.base64,
          question || '请描述这张截图的内容',
          cameraConfig,
        )
      }
      else if (visionConfig.url && visionConfig.token) {
        // 使用 MCP 客户端下发的 vision API
        console.log('[SystemToolsManager] 使用 MCP vision API 分析截图')
        analysisResult = await this.analyzeImageWithMCPVision(
          result.base64,
          question || '请描述这张截图的内容',
          { url: visionConfig.url, token: visionConfig.token },
        )
      }
      else {
        console.warn('[SystemToolsManager] 未配置 vision API')
        return JSON.stringify({
          success: false,
          message: '未配置视觉分析 API，无法分析截图内容',
        })
      }

      return analysisResult
    }
    catch (error) {
      console.error('[SystemToolsManager] 截图失败:', error)
      return JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : '截图失败',
      })
    }
  }

  /**
   * 使用本地 VL API 分析图片
   */
  private async analyzeImageWithLocalVL(
    base64Image: string,
    question: string,
    config: { vlUrl: string, vlApiKey: string, vlModel: string },
  ): Promise<string> {
    try {
      console.log('[SystemToolsManager] 使用本地 VL API 分析截图')

      // 动态导入 OpenAI 客户端
      const { default: OpenAI } = await import('openai')

      // 创建客户端
      const client = new OpenAI({
        apiKey: config.vlApiKey,
        baseURL: config.vlUrl,
      })

      // 准备消息
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
              },
            },
            {
              type: 'text',
              text: question || '图中描绘的是什么景象？请详细描述。',
            },
          ],
        },
      ]

      console.log(`[SystemToolsManager] 发送请求到智谱 AI: ${config.vlUrl}`)

      // 发送请求
      const completion = await client.chat.completions.create({
        model: config.vlModel,
        messages,
        stream: true,
      })

      // 收集响应
      let result = ''
      for await (const chunk of completion) {
        if (chunk.choices && chunk.choices[0]?.delta?.content) {
          result += chunk.choices[0].delta.content
        }
      }

      console.log(`[SystemToolsManager] 本地 VL 分析完成`)

      return JSON.stringify({
        success: true,
        text: result,
      })
    }
    catch (error) {
      console.error('[SystemToolsManager] 本地 VL API 分析失败:', error)
      return JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : '分析失败',
      })
    }
  }

  /**
   * 使用 MCP vision API 分析图片
   */
  private async analyzeImageWithMCPVision(
    base64Image: string,
    question: string,
    config: { url: string, token: string },
  ): Promise<string> {
    try {
      console.log('[SystemToolsManager] 使用 MCP vision API 分析截图')

      // 将 base64 转换为 Buffer
      const imageBuffer = Buffer.from(base64Image, 'base64')

      // 准备 FormData
      const formData = new FormData()
      formData.append('question', question)
      const blob = new Blob([Uint8Array.from(imageBuffer)], { type: 'image/jpeg' })
      formData.append('file', blob, 'screenshot.jpg')

      // 准备请求头
      const headers: Record<string, string> = {}

      // 从数据库获取设备配置
      const db = DatabaseManager.getInstance()
      const cameraConfig = db.getFormattedCameraConfig()
      if (cameraConfig.deviceId)
        headers['Device-Id'] = cameraConfig.deviceId

      // TODO: 从网络配置读取 clientId
      // if (clientId) headers['Client-Id'] = clientId

      if (config.token)
        headers.Authorization = `Bearer ${config.token}`

      console.log('[SystemToolsManager] 发送请求到:', config.url)

      // 发送请求
      const response = await fetch(config.url, {
        method: 'POST',
        headers,
        body: formData,
      })

      if (!response.ok) {
        const errorMsg = `Failed to analyze screenshot, status code: ${response.status}`
        console.error(`[SystemToolsManager] ${errorMsg}`)
        return JSON.stringify({
          success: false,
          message: errorMsg,
        })
      }

      const result = await response.text()
      console.log(`[SystemToolsManager] 分析完成: ${result}`)

      // 尝试解析 JSON
      try {
        const jsonResult = JSON.parse(result)
        // 如果返回的 JSON 已经包含 success 字段，直接返回
        if ('success' in jsonResult) {
          return result
        }
        // 否则包装成标准格式
        return JSON.stringify({
          success: true,
          text: jsonResult.text || result,
        })
      }
      catch {
        // 如果不是 JSON，包装成标准格式返回
        return JSON.stringify({
          success: true,
          text: result,
        })
      }
    }
    catch (error) {
      console.error('[SystemToolsManager] MCP vision API 分析失败:', error)
      return JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : '分析失败',
      })
    }
  }

  /**
   * 注册主题控制工具
   */
  private registerThemeControl(
    addTool: (name: string, description: string, properties: PropertyList, callback: (args: Record<string, unknown>) => Promise<string>) => void,
    PropertyListClass: typeof PropertyList,
    PropertyTypeEnum: typeof PropertyType,
  ): void {
    const themeProps = new PropertyListClass([
      {
        name: 'theme',
        type: PropertyTypeEnum.STRING,
      },
    ])

    const description = `Set the application theme (light/dark/auto). Changes the visual appearance across all windows.

Use this tool when:
1. User wants to change the theme or appearance
2. User says "切换深色模式", "switch to dark mode", "使用浅色主题"
3. User asks to enable/disable dark mode
4. User wants the theme to follow system preferences

Parameters:
- theme: Theme mode to set
  - "light": Light theme (浅色)
  - "dark": Dark theme (深色)
  - "auto": Follow system preferences (跟随系统)

Examples:
- "切换到深色模式" -> theme="dark"
- "使用浅色主题" -> theme="light"
- "跟随系统设置" -> theme="auto"
- "Turn on dark mode" -> theme="dark"`

    addTool(
      'self.ui.set_theme',
      description,
      themeProps,
      async (args: Record<string, unknown>): Promise<string> => {
        return await this.setTheme(args)
      },
    )

    console.log('[SystemToolsManager] 注册主题控制工具成功')
  }

  /**
   * 注册主题获取工具
   */
  private registerThemeGet(
    addTool: (name: string, description: string, properties: PropertyList, callback: (args: Record<string, unknown>) => Promise<string>) => void,
    PropertyListClass: typeof PropertyList,
    _PropertyTypeEnum: typeof PropertyType,
  ): void {
    const getThemeProps = new PropertyListClass([])

    const description = `Get the current theme setting of the application.

Use when:
- User asks about current theme
- Need to check theme before toggling
- User says "当前是什么主题?", "what theme is active?"

Returns:
- String indicating current theme: "light", "dark", or "auto"`

    addTool(
      'self.ui.get_theme',
      description,
      getThemeProps,
      async (args: Record<string, unknown>): Promise<string> => {
        return await this.getTheme(args)
      },
    )

    console.log('[SystemToolsManager] 注册主题获取工具成功')
  }

  /**
   * 注册系统信息工具
   */
  private registerSystemInfo(
    addTool: (name: string, description: string, properties: PropertyList, callback: (args: Record<string, unknown>) => Promise<string>) => void,
    PropertyListClass: typeof PropertyList,
    _PropertyTypeEnum: typeof PropertyType,
  ): void {
    const systemInfoProps = new PropertyListClass([])

    const description = `Get detailed system information including OS, hardware, and application details.

Use this tool when:
1. User asks about system specs or computer information
2. User wants to know OS version, CPU, memory details
3. User asks "what's my system info?", "系统信息", "电脑配置"
4. Troubleshooting or diagnostic purposes

Returns comprehensive JSON with:
- OS information (platform, version, architecture)
- Hardware details (CPU model, cores, memory)
- Application information (version, Electron version, Node version)
- System uptime and performance metrics

Examples:
- "我的电脑配置是什么?" -> Returns full system info
- "What OS am I running?" -> Returns OS details
- "How much RAM do I have?" -> Returns memory info`

    addTool(
      'self.system.get_info',
      description,
      systemInfoProps,
      async (args: Record<string, unknown>): Promise<string> => {
        return await this.getSystemInfo(args)
      },
    )

    console.log('[SystemToolsManager] 注册系统信息工具成功')
  }

  /**
   * 设置主题（工具实现）
   */
  private async setTheme(args: Record<string, unknown>): Promise<string> {
    try {
      const theme = args.theme as string

      // 验证主题值
      if (!['light', 'dark', 'auto'].includes(theme)) {
        console.warn(`[SystemToolsManager] 无效的主题值: ${theme}`)
        return JSON.stringify({
          success: false,
          message: `Invalid theme value: ${theme}. Must be 'light', 'dark', or 'auto'`,
        })
      }

      console.log(`[SystemToolsManager] 设置主题为: ${theme}`)

      // 通过 McpServer 回调广播主题更改
      const mcpServer = McpServer.getInstance()
      mcpServer.broadcastTheme(theme as 'light' | 'dark' | 'auto')

      console.log(`[SystemToolsManager] 主题设置成功: ${theme}`)
      return JSON.stringify({
        success: true,
        theme,
        message: `Theme set to ${theme}`,
      })
    }
    catch (error) {
      console.error('[SystemToolsManager] 设置主题失败:', error)
      return JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : '设置主题失败',
      })
    }
  }

  /**
   * 获取当前主题（工具实现）
   */
  private async getTheme(_args: Record<string, unknown>): Promise<string> {
    try {
      console.log('[SystemToolsManager] 获取当前主题')

      // 从任一窗口获取主题设置
      const { BrowserWindow } = await import('electron')
      const windows = BrowserWindow.getAllWindows()

      if (windows.length === 0) {
        return JSON.stringify({
          success: false,
          message: 'No windows available',
        })
      }

      // 向主窗口请求当前主题
      const result = await windows[0].webContents.executeJavaScript(
        `(function() {
          try {
            const mode = localStorage.getItem('vueuse-color-scheme') || 'auto';
            return { success: true, theme: mode };
          } catch (e) {
            return { success: false, message: e.message };
          }
        })()`,
      )

      console.log(`[SystemToolsManager] 当前主题:`, result)
      return JSON.stringify(result)
    }
    catch (error) {
      console.error('[SystemToolsManager] 获取主题失败:', error)
      return JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : '获取主题失败',
      })
    }
  }

  /**
   * 获取系统信息（工具实现）
   */
  private async getSystemInfo(_args: Record<string, unknown>): Promise<string> {
    try {
      console.log('[SystemToolsManager] 获取系统信息')

      const os = await import('node:os')
      const { app } = await import('electron')
      // eslint-disable-next-line node/prefer-global/process
      const processVersions = process.versions

      // 获取 CPU 信息
      const cpus = os.cpus()
      const cpuModel = cpus.length > 0 ? cpus[0].model : 'Unknown'
      const cpuCores = cpus.length

      // 计算 CPU 使用率（简单平均）
      let totalIdle = 0
      let totalTick = 0
      cpus.forEach((cpu) => {
        for (const type in cpu.times) {
          totalTick += cpu.times[type as keyof typeof cpu.times]
        }
        totalIdle += cpu.times.idle
      })
      const cpuUsage = Math.round(100 - (totalIdle / totalTick) * 100)

      // 内存信息
      const totalMemory = os.totalmem()
      const freeMemory = os.freemem()
      const usedMemory = totalMemory - freeMemory
      const memoryUsagePercent = Math.round((usedMemory / totalMemory) * 100)

      // 系统运行时间
      const uptimeSeconds = os.uptime()
      const uptimeDays = Math.floor(uptimeSeconds / 86400)
      const uptimeHours = Math.floor((uptimeSeconds % 86400) / 3600)
      const uptimeMinutes = Math.floor((uptimeSeconds % 3600) / 60)

      // 网络接口
      const networkInterfaces = os.networkInterfaces()
      const activeInterfaces = Object.entries(networkInterfaces)
        .filter(([_, addrs]) => addrs && addrs.length > 0)
        .map(([name, addrs]) => ({
          name,
          addresses: addrs!.filter(addr => !addr.internal).map(addr => ({
            address: addr.address,
            family: addr.family,
            mac: addr.mac,
          })),
        }))
        .filter(iface => iface.addresses.length > 0)

      const systemInfo = {
        success: true,
        os: {
          platform: os.platform(), // 'darwin', 'win32', 'linux'
          type: os.type(), // 'Darwin', 'Windows_NT', 'Linux'
          release: os.release(), // '23.6.0'
          version: os.version(), // Full OS version string
          arch: os.arch(), // 'x64', 'arm64'
          hostname: os.hostname(),
          uptime: {
            seconds: uptimeSeconds,
            formatted: `${uptimeDays}d ${uptimeHours}h ${uptimeMinutes}m`,
          },
        },
        hardware: {
          cpu: {
            model: cpuModel,
            cores: cpuCores,
            usage: `${cpuUsage}%`,
            speed: cpus[0]?.speed ? `${cpus[0].speed} MHz` : 'Unknown',
          },
          memory: {
            total: `${Math.round(totalMemory / 1024 / 1024 / 1024)} GB`,
            free: `${Math.round(freeMemory / 1024 / 1024 / 1024)} GB`,
            used: `${Math.round(usedMemory / 1024 / 1024 / 1024)} GB`,
            usage: `${memoryUsagePercent}%`,
            totalBytes: totalMemory,
            freeBytes: freeMemory,
          },
        },
        application: {
          name: app.getName(),
          version: app.getVersion(),
          electronVersion: processVersions.electron,
          chromeVersion: processVersions.chrome,
          nodeVersion: processVersions.node,
          v8Version: processVersions.v8,
        },
        network: {
          interfaces: activeInterfaces,
        },
        user: {
          homedir: os.homedir(),
          tmpdir: os.tmpdir(),
          username: os.userInfo().username,
        },
      }

      console.log('[SystemToolsManager] 系统信息获取成功')
      return JSON.stringify(systemInfo, null, 2)
    }
    catch (error) {
      console.error('[SystemToolsManager] 获取系统信息失败:', error)
      return JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : '获取系统信息失败',
      })
    }
  }

  /**
   * 检查管理器是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * 获取管理器状态
   */
  getStatus(): {
    initialized: boolean
    toolsCount: number
    availableTools: string[]
  } {
    const availableTools = [
      'self.audio_speaker.set_volume',
      'self.audio_speaker.get_volume',
      'self.application.launch',
      'self.application.list_running',
      'self.application.kill',
      'self.application.scan_installed',
      'self.camera.take_photo',
      'self.screenshot.take',
      'self.ui.set_theme',
      'self.ui.get_theme',
      'self.system.get_info',
    ]

    return {
      initialized: this.initialized,
      toolsCount: availableTools.length,
      availableTools,
    }
  }
}
