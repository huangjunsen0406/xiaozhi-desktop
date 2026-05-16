import type { PluginCommands, PluginContext } from '../core'
import type { Plugin } from './Plugin'
import { getLogger } from '../utils/logger'
import { PluginState } from './Plugin'

const logger = getLogger('PluginManager')

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
 * 插件管理器
 * 负责插件的注册、拓扑排序、生命周期管理和事件广播
 *
 * 特性:
 * - 拓扑排序：根据声明式依赖确定初始化顺序
 * - 循环依赖检测：注册阶段发现并报错
 * - 错误隔离：一个插件失败不影响其他插件
 * - 逆序关闭：后初始化的先关闭
 */
export class PluginManager {
  private plugins: Plugin[] = []
  private pluginsByName: Map<string, Plugin> = new Map()

  /** 排序后的插件顺序（setup/start 按此顺序执行） */
  private sortedPlugins: Plugin[] = []

  /**
   * 注册插件
   * @param plugins - 要注册的插件列表
   */
  register(...plugins: Plugin[]): void {
    for (const plugin of plugins) {
      if (this.pluginsByName.has(plugin.name)) {
        logger.warn(`插件 ${plugin.name} 已注册，跳过重复注册`)
        continue
      }

      this.plugins.push(plugin)
      this.pluginsByName.set(plugin.name, plugin)
      logger.info(`注册插件: ${plugin.name} (优先级: ${plugin.priority})`)
    }
  }

  /**
   * 取消注册插件
   * @param pluginName - 插件名称
   */
  unregister(pluginName: string): boolean {
    const plugin = this.pluginsByName.get(pluginName)
    if (!plugin) {
      logger.warn(`插件 ${pluginName} 未注册`)
      return false
    }

    const index = this.plugins.indexOf(plugin)
    if (index > -1) {
      this.plugins.splice(index, 1)
    }
    this.pluginsByName.delete(pluginName)
    logger.info(`取消注册插件: ${pluginName}`)
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
      logger.warn(`插件 ${pluginName} 不存在`)
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
      logger.warn(`插件 ${pluginName} 不存在`)
      return false
    }
    plugin.disable()
    return true
  }

  /**
   * 拓扑排序（Kahn 算法）
   *
   * 根据插件声明的 dependencies 进行排序，保证依赖先于被依赖者初始化。
   * 同级别按 priority 排序。
   * 检测循环依赖并抛出错误。
   */
  private topologicalSort(): Plugin[] {
    // 构建入度表和邻接表
    const inDegree = new Map<string, number>()
    const adjacency = new Map<string, string[]>()

    // 初始化
    for (const plugin of this.plugins) {
      inDegree.set(plugin.name, 0)
      adjacency.set(plugin.name, [])
    }

    // 构建图：依赖 -> 被依赖者（依赖方有入边）
    for (const plugin of this.plugins) {
      const PluginClass = plugin.constructor as typeof import('./Plugin').Plugin
      const deps = PluginClass.dependencies || []

      for (const depName of deps) {
        if (!this.pluginsByName.has(depName)) {
          logger.warn(`插件 ${plugin.name} ���赖 ${depName}，但该依赖未注册`)
          continue
        }
        // depName -> plugin.name（depName 必须先初始化）
        const adj = adjacency.get(depName)
        if (adj) {
          adj.push(plugin.name)
        }
        inDegree.set(plugin.name, (inDegree.get(plugin.name) || 0) + 1)
      }
    }

    // Kahn 算法
    // 使用优先级排序的队列，同级按 priority 小的优先
    const queue: Plugin[] = []
    for (const plugin of this.plugins) {
      if (inDegree.get(plugin.name) === 0) {
        queue.push(plugin)
      }
    }
    // 按 priority 排序队列
    queue.sort((a, b) => a.priority - b.priority)

    const sorted: Plugin[] = []

    while (queue.length > 0) {
      const current = queue.shift()!
      sorted.push(current)

      const neighbors = adjacency.get(current.name) || []
      const newReady: Plugin[] = []

      for (const neighborName of neighbors) {
        const degree = (inDegree.get(neighborName) || 0) - 1
        inDegree.set(neighborName, degree)
        if (degree === 0) {
          const plugin = this.pluginsByName.get(neighborName)
          if (plugin) {
            newReady.push(plugin)
          }
        }
      }

      // 新就绪的按 priority 排序后加入队列
      newReady.sort((a, b) => a.priority - b.priority)
      queue.push(...newReady)
    }

    // 检测循环依赖
    if (sorted.length !== this.plugins.length) {
      const remaining = this.plugins
        .filter(p => !sorted.includes(p))
        .map(p => p.name)
      throw new Error(`检测到循环依赖，涉及插件: ${remaining.join(', ')}`)
    }

    return sorted
  }

  /**
   * 初始化所有插件
   *
   * 执行拓扑排序，注入依赖，然后按序初始化。
   *
   * @param ctx - 插件上下文
   * @param cmd - ���件命令
   */
  async setupAll(ctx: PluginContext, cmd: PluginCommands): Promise<PluginExecutionResult[]> {
    logger.info('开始初始化所有插件...')

    // 执行拓扑排序
    this.sortedPlugins = this.topologicalSort()
    logger.info(`插件初始化顺序: ${this.sortedPlugins.map(p => p.name).join(' -> ')}`)

    const results: PluginExecutionResult[] = []

    for (const plugin of this.sortedPlugins) {
      const startTime = Date.now()
      try {
        // 注入依赖
        const PluginClass = plugin.constructor as typeof import('./Plugin').Plugin
        const deps = PluginClass.dependencies || []
        for (const depName of deps) {
          const dep = this.pluginsByName.get(depName)
          if (dep) {
            plugin.injectDependency(depName, dep)
          }
        }

        // 调用 setup
        await plugin.setup(ctx, cmd)
        results.push({
          pluginName: plugin.name,
          success: true,
          duration: Date.now() - startTime,
        })
        logger.info(`${plugin.name} 初始化完成 (${Date.now() - startTime}ms)`)
      }
      catch (error) {
        results.push({
          pluginName: plugin.name,
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
          duration: Date.now() - startTime,
        })
        logger.error(`${plugin.name} 初始化失败:`, error)
      }
    }

    const successCount = results.filter(r => r.success).length
    logger.info(`插件初始化完成: ${successCount}/${results.length} 成功`)
    return results
  }

  /**
   * 启动所有插件
   */
  async startAll(): Promise<PluginExecutionResult[]> {
    logger.info('开始启动所有插件...')
    const results: PluginExecutionResult[] = []

    // 按拓扑顺序启动
    const startOrder = this.sortedPlugins.length > 0 ? this.sortedPlugins : this.plugins

    for (const plugin of startOrder) {
      if (!plugin.enabled) {
        logger.info(`跳过禁用的插件: ${plugin.name}`)
        continue
      }

      if (plugin.state !== PluginState.INITIALIZED && plugin.state !== PluginState.STOPPED) {
        logger.warn(`插件 ${plugin.name} 状态异常: ${plugin.state}，跳过启动`)
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
        logger.info(`${plugin.name} 启动完成 (${Date.now() - startTime}ms)`)
      }
      catch (error) {
        results.push({
          pluginName: plugin.name,
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
          duration: Date.now() - startTime,
        })
        logger.error(`${plugin.name} 启动失败:`, error)
      }
    }

    return results
  }

  /**
   * 停止所有插件（逆序）
   */
  async stopAll(): Promise<PluginExecutionResult[]> {
    logger.info('开始停止所有插件...')
    const results: PluginExecutionResult[] = []

    // 按拓扑顺序的逆序停止
    const stopOrder = this.sortedPlugins.length > 0
      ? [...this.sortedPlugins].reverse()
      : [...this.plugins].reverse()

    for (const plugin of stopOrder) {
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
        logger.info(`${plugin.name} 已停止`)
      }
      catch (error) {
        results.push({
          pluginName: plugin.name,
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
          duration: Date.now() - startTime,
        })
        logger.error(`${plugin.name} 停止失败:`, error)
      }
    }

    return results
  }

  /**
   * 关闭所有插件（逆序）
   */
  async shutdownAll(): Promise<PluginExecutionResult[]> {
    logger.info('开始关闭所有插件...')
    const results: PluginExecutionResult[] = []

    // 按拓扑顺序的逆序关闭
    const shutdownOrder = this.sortedPlugins.length > 0
      ? [...this.sortedPlugins].reverse()
      : [...this.plugins].reverse()

    for (const plugin of shutdownOrder) {
      const startTime = Date.now()

      try {
        await plugin.shutdown()
        results.push({
          pluginName: plugin.name,
          success: true,
          duration: Date.now() - startTime,
        })
        logger.info(`${plugin.name} 已关闭`)
      }
      catch (error) {
        results.push({
          pluginName: plugin.name,
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
          duration: Date.now() - startTime,
        })
        logger.error(`${plugin.name} 关闭失败:`, error)
      }
    }

    logger.info('所有插件已关闭')
    return results
  }

  /**
   * 获取插件系统状��
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
}
