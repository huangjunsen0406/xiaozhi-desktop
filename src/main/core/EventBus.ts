import type { ServerMessage } from '@shared/types'
import type { Buffer } from 'node:buffer'
import type { Protocol } from '../protocols/Protocol'
import type { StateChangeData } from './StateManager'
import { getLogger } from '../utils/logger'

const logger = getLogger('EventBus')

export const Events = {
  DEVICE_STATE_CHANGED: 'device:state_changed',
  PROTOCOL_CONNECTED: 'protocol:connected',
  PROTOCOL_DISCONNECTED: 'protocol:disconnected',
  NETWORK_ERROR: 'protocol:network_error',
  INCOMING_AUDIO: 'audio:incoming',
  AUDIO_DECODED: 'audio:decoded',
  AUDIO_CHANNEL_OPENED: 'audio:channel_opened',
  AUDIO_CHANNEL_CLOSED: 'audio:channel_closed',
  INCOMING_JSON: 'message:incoming_json',
  MUSIC_PAUSE_REQUEST: 'music:pause_request',
  MUSIC_RESUME_REQUEST: 'music:resume_request',
  APP_SHUTDOWN: 'app:shutdown',
} as const

export interface EventPayloads {
  'device:state_changed': StateChangeData
  'protocol:connected': Protocol
  'protocol:disconnected': void
  'protocol:network_error': string
  'audio:incoming': Buffer
  'audio:decoded': Buffer
  'audio:channel_opened': void
  'audio:channel_closed': void
  'message:incoming_json': ServerMessage
  'music:pause_request': void
  'music:resume_request': void
  'app:shutdown': void
}

export type EventName = keyof EventPayloads
type EventArgs<K extends EventName> = EventPayloads[K] extends void ? [] : [data: EventPayloads[K]]
export type EventHandler<K extends EventName> = (...args: EventArgs<K>) => Promise<void> | void

/** 事件名决定载荷类型；并行广播隔离错误，顺序广播遇错停止。 */
export class EventBus {
  private handlers = new Map<EventName, unknown[]>()

  // Map 无法保留 key 与 value 的关联；擦除只发生在这个内部存储边界。
  private getHandlers<K extends EventName>(event: K): EventHandler<K>[] {
    return (this.handlers.get(event) ?? []) as EventHandler<K>[]
  }

  on<K extends EventName>(event: K, handler: EventHandler<K>): () => void {
    const list = this.getHandlers(event)
    if (!list.includes(handler)) {
      list.push(handler)
      this.handlers.set(event, list)
    }
    return () => this.off(event, handler)
  }

  off<K extends EventName>(event: K, handler: EventHandler<K>): void {
    const list = this.getHandlers(event)
    const index = list.indexOf(handler)
    if (index !== -1)
      list.splice(index, 1)
    if (!list.length)
      this.handlers.delete(event)
  }

  once<K extends EventName>(event: K, handler: EventHandler<K>): () => void {
    const wrapper: EventHandler<K> = async (...args) => {
      this.off(event, wrapper)
      await handler(...args)
    }
    return this.on(event, wrapper)
  }

  async emit<K extends EventName>(event: K, ...args: EventArgs<K>): Promise<void> {
    const results = await Promise.allSettled(
      [...this.getHandlers(event)].map(async handler => handler(...args)),
    )
    for (const result of results) {
      if (result.status === 'rejected')
        logger.error(`事件 ${event} 处理器执行异常:`, result.reason)
    }
  }

  async emitSequential<K extends EventName>(event: K, ...args: EventArgs<K>): Promise<void> {
    for (const handler of [...this.getHandlers(event)])
      await handler(...args)
  }

  clear(event?: EventName): void {
    if (event === undefined)
      this.handlers.clear()
    else
      this.handlers.delete(event)
  }

  hasHandlers(event: EventName): boolean {
    return this.handlerCount(event) > 0
  }

  handlerCount(event: EventName): number {
    return this.handlers.get(event)?.length ?? 0
  }
}
