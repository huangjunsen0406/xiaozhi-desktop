import type { PluginCommands, PluginContext } from '../core'
import type { Logger } from '../utils/logger'
import { getLogger } from '../utils/logger'

/**
 * 插件状态
 */
export enum PluginState {
  /** 未初始化 */
  UNINITIALIZED = 'uninitialized',
  /** 已初始化 */
  INITIALIZED = 'initialized',
  /** 运行中 */
  RUNNING = 'running',
  /** 已��止 */
  STOPPED = 'stopped',
  /** 已关闭 */
  SHUTDOWN = 'shutdown',
  /** 错误状态 */
  ERROR = 'error',
}

/**
 * 插件元数据
 */
export interface PluginMetadata {
  /** 插件名称 */
  name: string
  /** 插件版本 */
  version?: string
  /** 插件描述 */
  description?: string
  /** 插件作者 */
  author?: string
}

/**
 * 插件基类
 * 所有插件必须继承此类并实现相关生命周期方法
 *
 * 生命周期: register -> topologicalSort -> setup -> start -> (running) -> stop -> shutdown
 *
 * 插件通过 PluginContext（只读）和 PluginCommands（操作）与核心交互，
 * 不再直接持有 Application 引用。
 */
export abstract class Plugin {
  /**
   * 插件名称
   */
  abstract readonly name: string

  /**
   * 插件优先级（数值越小越优先执行）
   * 默认为 50
   */
  readonly priority: number = 50

  /**
   * 声明式依赖
   * 子类覆盖此静态属性声明自己依赖的插件名称列表
   */
  static readonly dependencies: string[] = []

  /**
   * 插件元数据（可选）
   */
  readonly metadata?: PluginMetadata

  /**
   * 插件当前状态
   */
  private _state: PluginState = PluginState.UNINITIALIZED

  /**
   * 插件是否启用
   */
  private _enabled: boolean = true

  /**
   * 插件上下文（只读状态查询）
   */
  protected ctx: PluginContext | null = null

  /**
   * 插件命令（操作接口）
   */
  protected cmd: PluginCommands | null = null

  /**
   * 依赖存储
   */
  private deps = new Map<string, Plugin>()

  /**
   * Logger 实例（懒加载）
   */
  private _logger?: Logger

  /**
   * 获取 logger 实例
   */
  protected get logger(): Logger {
    if (!this._logger) {
      this._logger = getLogger(this.name)
    }
    return this._logger
  }

  /**
   * ���取插件状态
   */
  get state(): PluginState {
    return this._state
  }

  /**
   * 设置插件状态（内部使用）
   */
  protected setState(state: PluginState): void {
    const oldState = this._state
    this._state = state
    this.logger.info(`状态变更: ${oldState} -> ${state}`)
  }

  /**
   * 获取插件是否启用
   */
  get enabled(): boolean {
    return this._enabled
  }

  /**
   * 启用插件
   */
  enable(): void {
    if (!this._enabled) {
      this._enabled = true
      this.logger.info('已启用')
    }
  }

  /**
   * ���用插件
   */
  disable(): void {
    if (this._enabled) {
      this._enabled = false
      this.logger.info('已禁用')
    }
  }

  /**
   * 注入依赖（由 PluginManager 调用）
   */
  injectDependency(name: string, plugin: Plugin): void {
    this.deps.set(name, plugin)
  }

  /**
   * 类型安全的依赖访问
   * @param name 依赖的插件名称
   */
  protected getDep<T extends Plugin>(name: string): T {
    const dep = this.deps.get(name)
    if (!dep) {
      throw new Error(`依赖 ${name} 未注入到 ${this.name}`)
    }
    return dep as T
  }

  /**
   * 插件初始化（在应用启动时调用一次）
   * @param ctx - 插件上下文（只读状态查询）
   * @param cmd - 插件命令（操作接口）
   */
  async setup(ctx: PluginContext, cmd: PluginCommands): Promise<void> {
    this.ctx = ctx
    this.cmd = cmd
    this.setState(PluginState.INITIALIZED)
  }

  /**
   * 插件启动（在初始化完成后调用）
   */
  async start(): Promise<void> {
    this.setState(PluginState.RUNNING)
  }

  /**
   * 插件停止
   */
  async stop(): Promise<void> {
    this.setState(PluginState.STOPPED)
  }

  /**
   * 插件关闭（清理资源）
   */
  async shutdown(): Promise<void> {
    this.ctx = null
    this.cmd = null
    this.deps.clear()
    this.setState(PluginState.SHUTDOWN)
  }

  /**
   * 获取插件信息（用于调试）
   */
  getInfo(): {
    name: string
    priority: number
    state: PluginState
    enabled: boolean
    metadata?: PluginMetadata
  } {
    return {
      name: this.name,
      priority: this.priority,
      state: this._state,
      enabled: this._enabled,
      metadata: this.metadata,
    }
  }
}
