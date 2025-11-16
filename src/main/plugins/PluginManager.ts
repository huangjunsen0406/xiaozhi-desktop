import type { DeviceState } from '../constants/DeviceState'
import type { Protocol } from '../protocols/Protocol'
import type { Plugin } from './Plugin'

/**
 * 插件管理器
 * 负责插件的注册、生命周期管理和事件广播
 */
export class PluginManager {
  private plugins: Plugin[] = []
  private pluginsByName: Map<string, Plugin> = new Map()

  /**
   * 注册插件（自动按 priority 排序）
   * @param plugins - 要注册的插件列表
   */
  register(...plugins: Plugin[]): void {
    // 按优先级排序（数值越小越优先）
    const sortedPlugins = [...plugins].sort((a, b) => a.priority - b.priority)

    for (const plugin of sortedPlugins) {
      if (!this.plugins.includes(plugin)) {
        this.plugins.push(plugin)
        if (plugin.name) {
          this.pluginsByName.set(plugin.name, plugin)
        }
      }
    }
  }

  /**
   * 根据名称获取插件
   * @param name - 插件名称
   * @returns 插件实例或 undefined
   */
  getPlugin(name: string): Plugin | undefined {
    return this.pluginsByName.get(name)
  }

  /**
   * 初始化所有插件
   * @param app - 应用实例
   */
  async setupAll(app: any): Promise<void> {
    for (const plugin of this.plugins) {
      try {
        await plugin.setup(app)
      }
      catch (error) {
        console.error(`[PluginManager] 插件 ${plugin.name} 初始化失败:`, error)
      }
    }
  }

  /**
   * 启动所有插件
   */
  async startAll(): Promise<void> {
    for (const plugin of this.plugins) {
      try {
        await plugin.start()
      }
      catch (error) {
        console.error(`[PluginManager] 插件 ${plugin.name} 启动失败:`, error)
      }
    }
  }

  /**
   * 通知所有插件：协议已连接
   * @param protocol - 协议实例
   */
  async notifyProtocolConnected(protocol: Protocol): Promise<void> {
    for (const plugin of this.plugins) {
      try {
        await plugin.onProtocolConnected(protocol)
      }
      catch (error) {
        console.error(`[PluginManager] 插件 ${plugin.name} 处理协议连接失败:`, error)
      }
    }
  }

  /**
   * 通知所有插件：收到 JSON 消息
   * @param message - JSON 消息
   */
  async notifyIncomingJson(message: any): Promise<void> {
    for (const plugin of this.plugins) {
      try {
        await plugin.onIncomingJson(message)
      }
      catch (error) {
        console.error(`[PluginManager] 插件 ${plugin.name} 处理 JSON 消息失败:`, error)
      }
    }
  }

  /**
   * 通知所有插件：收到音频数据
   * @param data - 音频二进制数据
   */
  async notifyIncomingAudio(data: Buffer): Promise<void> {
    for (const plugin of this.plugins) {
      try {
        await plugin.onIncomingAudio(data)
      }
      catch (error) {
        console.error(`[PluginManager] 插件 ${plugin.name} 处理音频数据失败:`, error)
      }
    }
  }

  /**
   * 通知所有插件：设备状态变化
   * @param state - 新的设备状态
   */
  async notifyDeviceStateChanged(state: DeviceState): Promise<void> {
    for (const plugin of this.plugins) {
      try {
        await plugin.onDeviceStateChanged(state)
      }
      catch (error) {
        console.error(`[PluginManager] 插件 ${plugin.name} 处理状态变化失败:`, error)
      }
    }
  }

  /**
   * 停止所有插件（逆序）
   */
  async stopAll(): Promise<void> {
    for (let i = this.plugins.length - 1; i >= 0; i--) {
      const plugin = this.plugins[i]
      try {
        await plugin.stop()
      }
      catch (error) {
        console.error(`[PluginManager] 插件 ${plugin.name} 停止失败:`, error)
      }
    }
  }

  /**
   * 关闭所有插件（逆序）
   */
  async shutdownAll(): Promise<void> {
    for (let i = this.plugins.length - 1; i >= 0; i--) {
      const plugin = this.plugins[i]
      try {
        await plugin.shutdown()
      }
      catch (error) {
        console.error(`[PluginManager] 插件 ${plugin.name} 关闭失败:`, error)
      }
    }
  }
}
