import type { Buffer } from 'node:buffer'
import type { DeviceState } from '../constants/DeviceState'
import type { Protocol } from '../protocols/Protocol'
import type { Application } from '../services/Application'
import type { JsonMessage } from '../types/protocol'
import type { Plugin } from './Plugin'
import { PluginState } from './Plugin'

/**
 * 插件执行结果
 */
interface PluginExecutionResult {
  pluginName: string
  success: boolean
  error?: Error
  duration: number
}

/**
 * 广播选项
 */
interface BroadcastOptions {
  /** 是否并发执行（默认 true） */
  concurrent?: boolean
  /** 超时时间（毫秒，0 表示无超时，默认 5000） */
  timeout?: number
  /** 是否只通知启用的插件（默认 true） */
  enabledOnly?: boolean
}

/**
 * 插件管理器
 * 负责插件的注册、生命周期管理和事件广播
 *
 * 特性:
 * - 错误隔离：一个插件失败不影响其他插件
 * - 并发广播：支持并行通知提升性能
 * - 状态管理：跟踪插件启用/禁用状态
 * - 性能监控：记录插件执行时间
 */
export class PluginManager {
  private plugins: Plugin[] = []
  private pluginsByName: Map<string, Plugin> = new Map()

  // 默认广播选项
  private defaultBroadcastOptions: Required<BroadcastOptions> = {
    concurrent: true,
    timeout: 100000,
    enabledOnly: true,
  }

  /**
   * 注册插件（自动按 priority 排序）
   * @param plugins - 要注册的插件列表
   */
  register(...plugins: Plugin[]): void {
    for (const plugin of plugins) {
      if (this.pluginsByName.has(plugin.name)) {
        console.warn(`[PluginManager] 插件 ${plugin.name} 已注册，跳过重复注册`)
        continue
      }

      this.plugins.push(plugin)
      this.pluginsByName.set(plugin.name, plugin)
      console.log(`[PluginManager] 注册插件: ${plugin.name} (优先级: ${plugin.priority})`)
    }

    // 按优先级排序
    this.plugins.sort((a, b) => a.priority - b.priority)
    console.log(`[PluginManager] 插件执行顺序: ${this.plugins.map(p => p.name).join(' -> ')}`)
  }

  /**
   * 取消注册插件
   * @param pluginName - 插件名称
   */
  unregister(pluginName: string): boolean {
    const plugin = this.pluginsByName.get(pluginName)
    if (!plugin) {
      console.warn(`[PluginManager] 插件 ${pluginName} 未注册`)
      return false
    }

    const index = this.plugins.indexOf(plugin)
    if (index > -1) {
      this.plugins.splice(index, 1)
    }
    this.pluginsByName.delete(pluginName)
    console.log(`[PluginManager] 取消注册插件: ${pluginName}`)
    return true
  }

  /**
   * 根据名称获取插件
   * @param name - 插件名称
   * @returns 插件实例或 undefined
   */
  getPlugin<T extends Plugin = Plugin>(name: string): T | undefined {
    return this.pluginsByName.get(name) as T | undefined
  }

  /**
   * 获取所有插件
   */
  getAllPlugins(): Plugin[] {
    return [...this.plugins]
  }

  /**
   * 获取所有启用的插件
   */
  getEnabledPlugins(): Plugin[] {
    return this.plugins.filter(p => p.enabled)
  }

  /**
   * 启用插件
   * @param pluginName - 插件名称
   */
  enablePlugin(pluginName: string): boolean {
    const plugin = this.pluginsByName.get(pluginName)
    if (!plugin) {
      console.warn(`[PluginManager] 插件 ${pluginName} 不存在`)
      return false
    }
    plugin.enable()
    return true
  }

  /**
   * 禁用插件
   * @param pluginName - 插件名称
   */
  disablePlugin(pluginName: string): boolean {
    const plugin = this.pluginsByName.get(pluginName)
    if (!plugin) {
      console.warn(`[PluginManager] 插件 ${pluginName} 不存在`)
      return false
    }
    plugin.disable()
    return true
  }

  /**
   * 初始化所有插件
   * @param app - 应用实例
   */
  async setupAll(app: Application): Promise<PluginExecutionResult[]> {
    console.log('[PluginManager] 开始初始化所有插件...')
    const results: PluginExecutionResult[] = []

    for (const plugin of this.plugins) {
      const startTime = Date.now()
      try {
        await plugin.setup(app)
        results.push({
          pluginName: plugin.name,
          success: true,
          duration: Date.now() - startTime,
        })
        console.log(`[PluginManager] ✓ ${plugin.name} 初始化完成 (${Date.now() - startTime}ms)`)
      }
      catch (error: any) {
        results.push({
          pluginName: plugin.name,
          success: false,
          error,
          duration: Date.now() - startTime,
        })
        console.error(`[PluginManager] ✗ ${plugin.name} 初始化失败:`, error)
        // 标记插件为错误状态但继续初始化其他插件
      }
    }

    const successCount = results.filter(r => r.success).length
    console.log(`[PluginManager] 插件初始化完成: ${successCount}/${results.length} 成功`)
    return results
  }

  /**
   * 启动所有插件
   */
  async startAll(): Promise<PluginExecutionResult[]> {
    console.log('[PluginManager] 开始启动所有插件...')
    const results: PluginExecutionResult[] = []

    for (const plugin of this.plugins) {
      if (!plugin.enabled) {
        console.log(`[PluginManager] 跳过禁用的插件: ${plugin.name}`)
        continue
      }

      if (plugin.state !== PluginState.INITIALIZED && plugin.state !== PluginState.STOPPED) {
        console.warn(`[PluginManager] 插件 ${plugin.name} 状态异常: ${plugin.state}，跳过启动`)
        continue
      }

      const startTime = Date.now()
      try {
        await plugin.start()
        results.push({
          pluginName: plugin.name,
          success: true,
          duration: Date.now() - startTime,
        })
        console.log(`[PluginManager] ✓ ${plugin.name} 启动完成 (${Date.now() - startTime}ms)`)
      }
      catch (error: any) {
        results.push({
          pluginName: plugin.name,
          success: false,
          error,
          duration: Date.now() - startTime,
        })
        console.error(`[PluginManager] ✗ ${plugin.name} 启动失败:`, error)
      }
    }

    return results
  }

  /**
   * 并发广播：执行所有插件的回调
   * @param methodName - 方法名称
   * @param args - 方法参数
   * @param options - 广播选项
   */
  private async broadcast(
    methodName: string,
    args: any[] = [],
    options: BroadcastOptions = {},
  ): Promise<PluginExecutionResult[]> {
    const opts = { ...this.defaultBroadcastOptions, ...options }
    const targetPlugins = opts.enabledOnly ? this.getEnabledPlugins() : this.plugins

    if (targetPlugins.length === 0) {
      return []
    }

    const executePlugin = async (plugin: Plugin): Promise<PluginExecutionResult> => {
      const startTime = Date.now()
      try {
        const method = (plugin as any)[methodName]
        if (typeof method === 'function') {
          const promise = method.apply(plugin, args)

          // 应用超时
          if (opts.timeout > 0) {
            await Promise.race([
              promise,
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`执行超时 (${opts.timeout}ms)`)), opts.timeout),
              ),
            ])
          }
          else {
            await promise
          }
        }

        return {
          pluginName: plugin.name,
          success: true,
          duration: Date.now() - startTime,
        }
      }
      catch (error: any) {
        console.error(`[PluginManager] 插件 ${plugin.name} 执行 ${methodName} 失败:`, error)
        return {
          pluginName: plugin.name,
          success: false,
          error,
          duration: Date.now() - startTime,
        }
      }
    }

    let results: PluginExecutionResult[]

    if (opts.concurrent) {
      // 并发执行
      const promises = targetPlugins.map(executePlugin)
      results = await Promise.all(promises)
    }
    else {
      // 顺序执行
      results = []
      for (const plugin of targetPlugins) {
        const result = await executePlugin(plugin)
        results.push(result)
      }
    }

    // 统计失败数量
    const failedCount = results.filter(r => !r.success).length
    if (failedCount > 0) {
      console.warn(`[PluginManager] ${methodName}: ${failedCount}/${results.length} 插件执行失败`)
    }

    return results
  }

  /**
   * 通知所有插件：协议已连接
   * @param protocol - 协议实例
   */
  async notifyProtocolConnected(protocol: Protocol): Promise<void> {
    await this.broadcast('onProtocolConnected', [protocol])
  }

  /**
   * 通知所有插件：协议已断开
   * @param reason - 断开原因
   */
  async notifyProtocolDisconnected(reason: string): Promise<void> {
    await this.broadcast('onProtocolDisconnected', [reason])
  }

  /**
   * 通知所有插件：音频通道已打开
   */
  async notifyAudioChannelOpened(): Promise<void> {
    await this.broadcast('onAudioChannelOpened', [])
  }

  /**
   * 通知所有插件：音频通道已关闭
   */
  async notifyAudioChannelClosed(): Promise<void> {
    await this.broadcast('onAudioChannelClosed', [])
  }

  /**
   * 通知所有插件：收到 JSON 消息
   * @param message - JSON 消息
   */
  async notifyIncomingJson(message: JsonMessage): Promise<void> {
    await this.broadcast('onIncomingJson', [message])
  }

  /**
   * 通知所有插件：收到音频数据
   * @param data - 音频二进制数据
   */
  async notifyIncomingAudio(data: Buffer): Promise<void> {
    await this.broadcast('onIncomingAudio', [data])
  }

  /**
   * 通知所有插件：设备状态变化
   * @param state - 新的设备状态
   */
  async notifyDeviceStateChanged(state: DeviceState): Promise<void> {
    await this.broadcast('onDeviceStateChanged', [state])
  }

  /**
   * 通知所有插件：网络错误
   * @param error - 错误信息
   */
  async notifyNetworkError(error: string): Promise<void> {
    await this.broadcast('onNetworkError', [error])
  }

  /**
   * 停止所有插件（逆序）
   */
  async stopAll(): Promise<PluginExecutionResult[]> {
    console.log('[PluginManager] 开始停止所有插件...')
    const results: PluginExecutionResult[] = []

    // 逆序停止（后注册的先停止）
    for (let i = this.plugins.length - 1; i >= 0; i--) {
      const plugin = this.plugins[i]

      if (plugin.state !== PluginState.RUNNING) {
        continue
      }

      const startTime = Date.now()
      try {
        await plugin.stop()
        results.push({
          pluginName: plugin.name,
          success: true,
          duration: Date.now() - startTime,
        })
        console.log(`[PluginManager] ✓ ${plugin.name} 已停止`)
      }
      catch (error: any) {
        results.push({
          pluginName: plugin.name,
          success: false,
          error,
          duration: Date.now() - startTime,
        })
        console.error(`[PluginManager] ✗ ${plugin.name} 停止失败:`, error)
      }
    }

    return results
  }

  /**
   * 关闭所有插件（逆序）
   */
  async shutdownAll(): Promise<PluginExecutionResult[]> {
    console.log('[PluginManager] 开始关闭所有插件...')
    const results: PluginExecutionResult[] = []

    // 逆序关闭
    for (let i = this.plugins.length - 1; i >= 0; i--) {
      const plugin = this.plugins[i]
      const startTime = Date.now()

      try {
        await plugin.shutdown()
        results.push({
          pluginName: plugin.name,
          success: true,
          duration: Date.now() - startTime,
        })
        console.log(`[PluginManager] ✓ ${plugin.name} 已关闭`)
      }
      catch (error: any) {
        results.push({
          pluginName: plugin.name,
          success: false,
          error,
          duration: Date.now() - startTime,
        })
        console.error(`[PluginManager] ✗ ${plugin.name} 关闭失败:`, error)
      }
    }

    console.log('[PluginManager] 所有插件已关闭')
    return results
  }

  /**
   * 获取插件系统状态
   */
  getStatus(): {
    totalPlugins: number
    enabledPlugins: number
    runningPlugins: number
    plugins: Array<{
      name: string
      priority: number
      state: PluginState
      enabled: boolean
    }>
  } {
    return {
      totalPlugins: this.plugins.length,
      enabledPlugins: this.getEnabledPlugins().length,
      runningPlugins: this.plugins.filter(p => p.state === PluginState.RUNNING).length,
      plugins: this.plugins.map(p => p.getInfo()),
    }
  }

  /**
   * 检查插件依赖
   * @param plugin - 插件实例
   * @returns 是否满足依赖
   */
  checkDependencies(plugin: Plugin): { satisfied: boolean, missing: string[] } {
    const dependencies = plugin.metadata?.dependencies || []
    const missing: string[] = []

    for (const dep of dependencies) {
      if (!this.pluginsByName.has(dep)) {
        missing.push(dep)
      }
    }

    return {
      satisfied: missing.length === 0,
      missing,
    }
  }
}
