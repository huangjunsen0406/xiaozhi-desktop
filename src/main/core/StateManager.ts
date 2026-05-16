/**
 * 状态管理器
 *
 * 集中管理设备状态，通过事件总线广播状态变更。
 * 使用互斥锁（async-mutex）确保状态变更的原子性，锁外广播事件避免死锁。
 */

import type { AppStateSnapshot, DeviceState, ListeningMode } from '@shared/types'
import type { EventBus } from './EventBus'
import { DeviceStateValue, ListeningModeValue } from '@shared/types'
import { Mutex } from 'async-mutex'
import { getLogger } from '../utils/logger'
import { Events } from './EventBus'

const logger = getLogger('StateManager')

/** 状态变更事件数据 */
export interface StateChangeData {
  oldState: DeviceState
  newState: DeviceState
}

/**
 * 状态管理器
 *
 * 职责:
 * - 管理设备状态 (IDLE, CONNECTING, LISTENING, SPEAKING)
 * - 管理监听模式 (REALTIME, AUTO, MANUAL)
 * - 管理会话状态 (keepListening, aborted)
 * - 通过事件总线广播状态变更
 *
 * @example
 * ```typescript
 * const state = new StateManager(eventBus)
 *
 * // 设置状态（会自动广播）
 * await state.setDeviceState(DeviceStateValue.LISTENING)
 *
 * // 读取状态
 * if (state.isListening()) { ... }
 * ```
 */
export class StateManager {
  /** 互斥锁，保护状态变更的原子性 */
  private mutex = new Mutex()

  /** 事件总线引用 */
  private eventBus: EventBus

  /** 设备状态 */
  private deviceState: DeviceState = DeviceStateValue.IDLE

  /** 监听模式 */
  private listeningMode: ListeningMode = ListeningModeValue.MANUAL

  /** 是否保持持续监听 */
  private keepListening: boolean = false

  /** 中止标志 */
  private aborted: boolean = false

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus
  }

  // -------------------------
  // 设备状态
  // -------------------------

  /**
   * 获取当前设备状态
   */
  getDeviceState(): DeviceState {
    return this.deviceState
  }

  /**
   * 设置设备状态
   *
   * 使用互斥锁确保原子性变更，在锁外广播事件避免死锁。
   *
   * @param state 新的设备状态
   */
  async setDeviceState(state: DeviceState): Promise<void> {
    let oldState: DeviceState | undefined

    // 锁内完成状态变更
    const release = await this.mutex.acquire()
    try {
      if (this.deviceState === state)
        return

      oldState = this.deviceState
      this.deviceState = state
      logger.info(`设备状态变更: ${oldState} -> ${state}`)

      // 进入监听状态时重置中止标志
      if (state === DeviceStateValue.LISTENING) {
        this.aborted = false
      }
    }
    finally {
      release()
    }

    // 锁外广播，避免死锁
    if (oldState !== undefined) {
      await this.eventBus.emit(Events.DEVICE_STATE_CHANGED, {
        oldState,
        newState: state,
      } satisfies StateChangeData)
    }
  }

  /**
   * 是否处于空闲状态
   */
  isIdle(): boolean {
    return this.deviceState === DeviceStateValue.IDLE
  }

  /**
   * 是否正在监听
   */
  isListening(): boolean {
    return this.deviceState === DeviceStateValue.LISTENING
  }

  /**
   * 是否正在说话
   */
  isSpeaking(): boolean {
    return this.deviceState === DeviceStateValue.SPEAKING
  }

  // -------------------------
  // 监听模式
  // -------------------------

  /**
   * 获取当前监听模式
   */
  getListeningMode(): ListeningMode {
    return this.listeningMode
  }

  /**
   * 设置监听模式
   */
  setListeningMode(mode: ListeningMode): void {
    this.listeningMode = mode
    logger.debug(`监听模式设置为: ${mode}`)
  }

  // -------------------------
  // 会话状态
  // -------------------------

  /**
   * 是否保持持续监听
   */
  isKeepListening(): boolean {
    return this.keepListening
  }

  /**
   * 设置持续监听状态
   */
  setKeepListening(value: boolean): void {
    this.keepListening = value
    logger.debug(`持续监听: ${value}`)
  }

  // -------------------------
  // 中止状态
  // -------------------------

  /**
   * 是否已中止
   */
  isAborted(): boolean {
    return this.aborted
  }

  /**
   * 设置中止状态
   */
  setAborted(value: boolean): void {
    this.aborted = value
  }

  // -------------------------
  // 复合状态查询
  // -------------------------

  /**
   * 是否应该采集音频
   *
   * 在以下情况下需要采集:
   * 1. 正在监听且未中止
   * 2. 正在说话，但在实时模式下保持监听（全双工）
   */
  shouldCaptureAudio(): boolean {
    if (this.deviceState === DeviceStateValue.LISTENING && !this.aborted) {
      return true
    }

    return (
      this.deviceState === DeviceStateValue.SPEAKING
      && this.keepListening
      && this.listeningMode === ListeningModeValue.REALTIME
    )
  }

  /**
   * 获取状态快照
   *
   * 返回当前所有状态的对象，用于调试和日志。
   */
  getSnapshot(): AppStateSnapshot {
    return {
      deviceState: this.deviceState,
      listeningMode: this.listeningMode,
      keepListening: this.keepListening,
      channelOpen: false, // 由外部组合填充
    }
  }
}
