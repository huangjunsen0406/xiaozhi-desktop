/**
 * 事件总线
 *
 * 提供组件间解耦通信机制。
 * 支持多处理器、并行/顺序执行、错误隔离。
 */

import { getLogger } from '../utils/logger'

const logger = getLogger('EventBus')

/** 事件处理器类型 */
export type EventHandler = (data?: unknown) => Promise<void> | void

/**
 * 预定义事件常量
 * 集中管理所有事件名称，避免魔术字符串
 */
export const Events = {
  // 设备状态
  DEVICE_STATE_CHANGED: 'device_state_changed',

  // 协议相关
  PROTOCOL_CONNECTED: 'protocol_connected',
  PROTOCOL_DISCONNECTED: 'protocol_disconnected',

  // 数据流
  INCOMING_JSON: 'incoming_json',
  INCOMING_AUDIO: 'incoming_audio',
  AUDIO_DECODED: 'audio_decoded',

  // 网络
  NETWORK_ERROR: 'network_error',
  AUDIO_CHANNEL_OPENED: 'audio_channel_opened',
  AUDIO_CHANNEL_CLOSED: 'audio_channel_closed',

  // 音乐控制
  MUSIC_PAUSE_REQUEST: 'music_pause_request',
  MUSIC_RESUME_REQUEST: 'music_resume_request',

  // 应用生命周期
  APP_SHUTDOWN: 'app_shutdown',
} as const

/**
 * 事件总线
 *
 * 支持异步事件处理，实现组件间松耦合通信。
 *
 * @example
 * ```typescript
 * const bus = new EventBus()
 *
 * // 注册处理器
 * bus.on(Events.DEVICE_STATE_CHANGED, async (data) => {
 *   console.log('状态变更:', data)
 * })
 *
 * // 触发事件（并行执行所有处理器）
 * await bus.emit(Events.DEVICE_STATE_CHANGED, { oldState, newState })
 * ```
 */
export class EventBus {
  /** 事件处理器映射表 */
  private handlers = new Map<string, EventHandler[]>()

  /**
   * 注册事件处理器
   *
   * @param event 事件名称
   * @param handler 处理函数（同步或异步）
   */
  on(event: string, handler: EventHandler): void {
    const list = this.handlers.get(event) || []
    // 去重注册：避免同一处理器重复绑定
    if (!list.includes(handler)) {
      list.push(handler)
      this.handlers.set(event, list)
      logger.debug(`注册处理器 -> ${event}`)
    }
  }

  /**
   * 移除事件处理器
   *
   * @param event 事件名称
   * @param handler 要移除的处理函数
   */
  off(event: string, handler: EventHandler): void {
    const list = this.handlers.get(event)
    if (!list)
      return

    const index = list.indexOf(handler)
    if (index !== -1) {
      list.splice(index, 1)
      logger.debug(`移除处理器 <- ${event}`)
      // 清理空列表
      if (list.length === 0) {
        this.handlers.delete(event)
      }
    }
  }

  /**
   * 注册一次性事件处理器
   * 触发一次后自动移除
   *
   * @param event 事件名称
   * @param handler 处理函数
   */
  once(event: string, handler: EventHandler): void {
    const wrapper: EventHandler = async (data?: unknown) => {
      this.off(event, wrapper)
      await handler(data)
    }
    this.on(event, wrapper)
  }

  /**
   * 触发事件（并行执行所有处理器）
   *
   * 使用 Promise.allSettled 确保单个处理器失败不影响其他处理器。
   *
   * @param event 事件名称
   * @param data 事件数据
   */
  async emit(event: string, data?: unknown): Promise<void> {
    const list = this.handlers.get(event)
    if (!list || list.length === 0)
      return

    logger.debug(`触发事件 ${event}, ${list.length} 个处理器`)

    // 复制列表，防止处理器中修改导致迭代异常
    const handlers = [...list]
    const results = await Promise.allSettled(
      handlers.map(handler => this.safeCall(handler, data)),
    )

    // 记录失败的处理器
    for (const result of results) {
      if (result.status === 'rejected') {
        logger.error(`事件 ${event} 处理器执行异常:`, result.reason)
      }
    }
  }

  /**
   * 顺序触发事件
   *
   * 按注册顺序依次调用处理器，前一个完成后再调用下一个。
   * 适用于有依赖关系的处理场景。
   *
   * @param event 事件名称
   * @param data 事件数据
   */
  async emitSequential(event: string, data?: unknown): Promise<void> {
    const list = this.handlers.get(event)
    if (!list || list.length === 0)
      return

    // 复制列表，防止处理器中修改导致迭代异常
    const handlers = [...list]
    for (const handler of handlers) {
      await this.safeCall(handler, data)
    }
  }

  /**
   * 清除事件处理器
   *
   * @param event 事件名称，为 undefined 时清除所有事件的处理器
   */
  clear(event?: string): void {
    if (event === undefined) {
      this.handlers.clear()
      logger.debug('清除所有处理器')
    }
    else {
      this.handlers.delete(event)
      logger.debug(`清除事件 ${event} 的所有处理器`)
    }
  }

  /**
   * 检查事件是否有处理器
   *
   * @param event 事件名称
   * @returns 是否存在至少一个处理器
   */
  hasHandlers(event: string): boolean {
    const list = this.handlers.get(event)
    return !!list && list.length > 0
  }

  /**
   * 获取事件的处理器数量
   *
   * @param event 事件名称
   * @returns 处理器数量
   */
  handlerCount(event: string): number {
    const list = this.handlers.get(event)
    return list ? list.length : 0
  }

  /**
   * 安全调用处理器，捕获异常防止扩散
   */
  private async safeCall(handler: EventHandler, data?: unknown): Promise<void> {
    try {
      await handler(data)
    }
    catch (error) {
      logger.error('处理器执行异常:', error)
      throw error // 重新抛出，由 Promise.allSettled 捕获
    }
  }
}
