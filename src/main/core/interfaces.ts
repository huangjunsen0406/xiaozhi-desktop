/**
 * 接口契约定义
 *
 * 定义插件与核心服务之间的契约，实现松耦合。
 * - PluginContext: 插件只读上下文（查询状态）
 * - PluginCommands: 插件命令接口（执行操作）
 */

import type { DeviceState, ListeningMode } from '@shared/types'
import type { Buffer } from 'node:buffer'
import type { EventBus } from './EventBus'

/**
 * 插件可访问的只读上下文
 *
 * 插件通过此接口获取应用状态，但不能直接修改状态。
 * 遵循最小权限原则：插件只能看到自己需要的信息。
 */
export interface PluginContext {
  /** 事件总线（可订阅/发布事件） */
  readonly eventBus: EventBus

  /** 获取当前设备状态 */
  getDeviceState: () => DeviceState

  /** 获取当前监听模式 */
  getListeningMode: () => ListeningMode

  /** 是否正在监听 */
  isListening: () => boolean

  /** 是否正在说话 */
  isSpeaking: () => boolean

  /** 是否处于空闲状态 */
  isIdle: () => boolean

  /** 音频通道是否已打开 */
  isAudioChannelOpened: () => boolean

  /** 是否应该采集音频 */
  shouldCaptureAudio: () => boolean
}

/**
 * 插件可执行的命令
 *
 * 插件通过此接口执行操作，由核心服务实现具体逻辑。
 * 遵循最小权限原则：插件只能执行受限的操作集。
 */
export interface PluginCommands {
  /** 开始监听 */
  startListening: (mode: ListeningMode) => Promise<void>

  /** 停止监听 */
  stopListening: () => Promise<void>

  /** 中止语音输出 */
  abortSpeaking: (reason: string) => Promise<void>

  /** 发送音频数据 */
  sendAudio: (data: Buffer) => Promise<void>

  /** 发送文本消息 */
  sendText: (text: string) => Promise<void>

  /** 连接协议通道 */
  connectProtocol: () => Promise<boolean>

  /** 发送 MCP 消息 */
  sendMcpMessage: (message: string) => Promise<void>

  /** 发送唤醒词检测消息 */
  sendWakeWordDetected: (text: string) => Promise<void>

  /** 创建异步任务（带追踪） */
  spawn: <T>(promise: Promise<T>, name: string) => Promise<T>
}
