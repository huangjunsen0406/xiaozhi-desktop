import type { PropertyList, PropertyType } from '../types'
import { SystemVolumeController } from '../../utils/SystemVolumeController'

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

      // TODO: 注册应用程序启动工具
      // this.registerAppLauncher(addTool, PropertyListClass, PropertyTypeEnum)

      // TODO: 注册应用程序扫描工具
      // this.registerAppScanner(addTool, PropertyListClass, PropertyTypeEnum)

      // TODO: 注册应用程序关闭工具
      // this.registerAppKiller(addTool, PropertyListClass, PropertyTypeEnum)

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
      'set_volume',
      'get_volume',
      // TODO: 添加更多工具
      // 'launch_application',
      // 'scan_installed_applications',
      // 'kill_application',
      // 'list_running_applications',
    ]

    return {
      initialized: this.initialized,
      toolsCount: availableTools.length,
      availableTools,
    }
  }
}
