import type { PropertyList, PropertyType, ToolCallback } from '../types'
import type { MusicPlayer } from './music/MusicPlayer'
import { getLogger } from '../../utils/logger'
import { getAllTools } from './index'
import { MusicToolsManager } from './music'

const logger = getLogger('SystemTools')

/** addTool 函数类型 */
type AddToolFn = (name: string, description: string, properties: PropertyList, callback: ToolCallback) => void

/**
 * 系统工具管理器
 * 负责编排 MCP 工具注册：
 * - 从函数式注册表获取所有已注册的工具
 * - 注册音乐工具（通过注入的 MusicPlayer / MusicToolsManager）
 *
 * 无静态懒单例：由 McpServer.addCommonTools 创建。
 */
export class SystemToolsManager {
  private initialized = false

  private addTool!: AddToolFn
  private PropertyList!: typeof PropertyList
  private PropertyType!: typeof PropertyType
  private musicPlayer: MusicPlayer | null

  constructor(musicPlayer: MusicPlayer | null = null) {
    this.musicPlayer = musicPlayer
    logger.info('系统工具管理器初始化')
  }

  /**
   * 初始化并注册所有系统工具
   */
  async init(
    addTool: AddToolFn,
    PropertyListClass: typeof PropertyList,
    PropertyTypeEnum: typeof PropertyType,
  ): Promise<void> {
    try {
      logger.info('开始注册系统工具')

      // 存为实例字段
      this.addTool = addTool
      this.PropertyList = PropertyListClass
      this.PropertyType = PropertyTypeEnum

      // 从注册表获取所有已定义的工具并注册
      const tools = getAllTools()
      for (const tool of tools) {
        this.addTool(tool.name, tool.description, tool.properties, tool.callback)
      }
      logger.info(`从注册表注册了 ${tools.length} 个工具`)

      // 注册音乐工具（通过注入的 MusicPlayer）
      this.registerMusicTools()

      this.initialized = true
      logger.info('系统工具注册完成')
    }
    catch (error) {
      logger.error('系统工具注册失败:', error)
      throw error
    }
  }

  /**
   * 注册音乐播放工具
   */
  private registerMusicTools(): void {
    if (!this.musicPlayer) {
      logger.warn('MusicPlayer 未注入，跳过音乐工具注册')
      return
    }
    const musicManager = new MusicToolsManager(this.musicPlayer)
    musicManager.register(this.addTool, this.PropertyList, this.PropertyType)
    logger.info('注册音乐工具成功')
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
      'self.timer.start_countdown',
      'self.timer.cancel_countdown',
      'self.timer.get_active_timers',
      'self.music.search',
      'self.music.play',
      'self.music.pause',
      'self.music.resume',
      'self.music.stop',
      'self.music.set_volume',
      'self.music.seek',
      'self.music.set_loop',
      'self.music.set_playback_rate',
      'self.music.get_status',
      'self.music.get_lyrics',
    ]

    return {
      initialized: this.initialized,
      toolsCount: availableTools.length,
      availableTools,
    }
  }
}
