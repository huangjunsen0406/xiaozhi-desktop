import type { PluginCommands, PluginContext } from '../core'
import type { Plugin } from './Plugin'
import { getLogger } from '../utils/logger'
import { PluginState } from './Plugin'

const logger = getLogger('PluginManager')

export interface PluginExecutionResult {
  pluginName: string
  success: boolean
  error?: Error
  duration: number
}

interface PluginConstructor {
  readonly dependencies?: string[]
}

export class PluginManager {
  private plugins: Plugin[] = []
  private pluginsByName: Map<string, Plugin> = new Map()
  private sortedPlugins: Plugin[] = []

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

  getPlugin<T extends Plugin = Plugin>(name: string): T | undefined {
    return this.pluginsByName.get(name) as T | undefined
  }

  private topologicalSort(): Plugin[] {
    const inDegree = new Map<string, number>()
    const adjacency = new Map<string, string[]>()

    for (const plugin of this.plugins) {
      inDegree.set(plugin.name, 0)
      adjacency.set(plugin.name, [])
    }

    for (const plugin of this.plugins) {
      const deps = (plugin.constructor as PluginConstructor).dependencies || []
      for (const depName of deps) {
        if (!this.pluginsByName.has(depName)) {
          logger.warn(`插件 ${plugin.name} 依赖 ${depName}，但该依赖未注册`)
          continue
        }
        adjacency.get(depName)!.push(plugin.name)
        inDegree.set(plugin.name, (inDegree.get(plugin.name) || 0) + 1)
      }
    }

    const queue = this.plugins
      .filter(p => inDegree.get(p.name) === 0)
      .sort((a, b) => a.priority - b.priority)

    const sorted: Plugin[] = []
    while (queue.length > 0) {
      const current = queue.shift()!
      sorted.push(current)

      for (const neighborName of adjacency.get(current.name) || []) {
        const degree = (inDegree.get(neighborName) || 0) - 1
        inDegree.set(neighborName, degree)
        if (degree === 0) {
          const plugin = this.pluginsByName.get(neighborName)
          if (plugin)
            queue.push(plugin)
        }
      }
      queue.sort((a, b) => a.priority - b.priority)
    }

    if (sorted.length !== this.plugins.length) {
      const remaining = this.plugins.filter(p => !sorted.includes(p)).map(p => p.name)
      throw new Error(`检测到循环依赖，涉及插件: ${remaining.join(', ')}`)
    }

    return sorted
  }

  private async runPhase(
    order: Plugin[],
    label: string,
    action: (plugin: Plugin) => Promise<void>,
    shouldRun?: (plugin: Plugin) => boolean,
  ): Promise<PluginExecutionResult[]> {
    const results: PluginExecutionResult[] = []

    for (const plugin of order) {
      if (shouldRun && !shouldRun(plugin))
        continue

      const startTime = Date.now()
      try {
        await action(plugin)
        const duration = Date.now() - startTime
        results.push({ pluginName: plugin.name, success: true, duration })
        logger.info(`${plugin.name} ${label}完成 (${duration}ms)`)
      }
      catch (error) {
        results.push({
          pluginName: plugin.name,
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
          duration: Date.now() - startTime,
        })
        logger.error(`${plugin.name} ${label}失败:`, error)
      }
    }

    return results
  }

  private getExecutionOrder(reverse = false): Plugin[] {
    const base = this.sortedPlugins.length > 0 ? this.sortedPlugins : this.plugins
    return reverse ? [...base].reverse() : base
  }

  async setupAll(ctx: PluginContext, cmd: PluginCommands): Promise<PluginExecutionResult[]> {
    logger.info('开始初始化所有插件...')
    this.sortedPlugins = this.topologicalSort()
    logger.info(`插件初始化顺序: ${this.sortedPlugins.map(p => p.name).join(' -> ')}`)

    const results = await this.runPhase(this.sortedPlugins, '初始化', async (plugin) => {
      const deps = (plugin.constructor as PluginConstructor).dependencies || []
      for (const depName of deps) {
        const dep = this.pluginsByName.get(depName)
        if (dep)
          plugin.injectDependency(depName, dep)
      }
      await plugin.setup(ctx, cmd)
    })

    const successCount = results.filter(r => r.success).length
    logger.info(`插件初始化完成: ${successCount}/${results.length} 成功`)
    return results
  }

  async startAll(): Promise<PluginExecutionResult[]> {
    logger.info('开始启动所有插件...')
    return this.runPhase(
      this.getExecutionOrder(),
      '启动',
      plugin => plugin.start(),
      (plugin) => {
        if (!plugin.enabled) {
          logger.info(`跳过禁用的插件: ${plugin.name}`)
          return false
        }
        if (plugin.state !== PluginState.INITIALIZED && plugin.state !== PluginState.STOPPED) {
          logger.warn(`插件 ${plugin.name} 状态异常: ${plugin.state}，跳过启动`)
          return false
        }
        return true
      },
    )
  }

  async stopAll(): Promise<PluginExecutionResult[]> {
    logger.info('开始停止所有插件...')
    return this.runPhase(
      this.getExecutionOrder(true),
      '停止',
      plugin => plugin.stop(),
      plugin => plugin.state === PluginState.RUNNING,
    )
  }

  async shutdownAll(): Promise<PluginExecutionResult[]> {
    logger.info('开始关闭所有插件...')
    const results = await this.runPhase(
      this.getExecutionOrder(true),
      '关闭',
      plugin => plugin.shutdown(),
    )
    logger.info('所有插件已关闭')
    return results
  }
}
