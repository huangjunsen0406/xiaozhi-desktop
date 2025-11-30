import type { Buffer } from 'node:buffer'
import type { DeviceState } from '../constants/DeviceState'
import type { Protocol } from '../protocols/Protocol'
import type { Application } from '../services/Application'
import type { JsonMessage } from '../types/protocol'
import { createLogger } from '../utils/logger'

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
  /** 已停止 */
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
  /** 插件依赖 */
  dependencies?: string[]
}

/**
 * 插件基类
 * 所有插件必须继承此类并实现相关生命周期方法
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
   * 应用实例引用
   */
  protected app: Application | null = null

  /**
   * Logger 实例（懒加载）
   */
  private _logger?: ReturnType<typeof createLogger>

  /**
   * 获取 logger 实例
   */
  protected get logger(): ReturnType<typeof createLogger> {
    if (!this._logger) {
      this._logger = createLogger(this.name)
    }
    return this._logger
  }

  /**
   * 获取插件状态
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
   * 禁用插件
   */
  disable(): void {
    if (this._enabled) {
      this._enabled = false
      this.logger.info('已禁用')
    }
  }

  /**
   * 插件初始化（在应用启动时调用一次）
   * @param _app - 应用实例
   */
  async setup(_app: Application): Promise<void> {
    this.app = _app
    this.setState(PluginState.INITIALIZED)
  }

  /**
   * 插件启动（在初始化完成后调用）
   */
  async start(): Promise<void> {
    this.setState(PluginState.RUNNING)
  }

  /**
   * 协议连接成功回调
   * @param _protocol - 协议实例
   */
  async onProtocolConnected(_protocol: Protocol): Promise<void> {
    // 子类可选实现
  }

  /**
   * 协议断开连接回调
   * @param _reason - 断开原因
   */
  async onProtocolDisconnected(_reason: string): Promise<void> {
    // 子类可选实现
  }

  /**
   * 音频通道打开回调
   */
  async onAudioChannelOpened(): Promise<void> {
    // 子类可选实现
  }

  /**
   * 音频通道关闭回调
   */
  async onAudioChannelClosed(): Promise<void> {
    // 子类可选实现
  }

  /**
   * 接收到 JSON 消息回调
   * @param _message - JSON 消息数据
   */
  async onIncomingJson(_message: JsonMessage): Promise<void> {
    // 子类可选实现
  }

  /**
   * 接收到音频数据回调
   * @param _data - 音频二进制数据
   */
  async onIncomingAudio(_data: Buffer): Promise<void> {
    // 子类可选实现
  }

  /**
   * 设备状态变化回调
   * @param _state - 新的设备状态
   */
  async onDeviceStateChanged(_state: DeviceState): Promise<void> {
    // 子类可选实现
  }

  /**
   * 网络错误回调
   * @param _error - 错误信息
   */
  async onNetworkError(_error: string): Promise<void> {
    // 子类可选实现
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
    this.app = null
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
