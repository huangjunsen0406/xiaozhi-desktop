/**
 * 接口契约定义
 *
 * - PluginContext: 插件只读上下文（查询状态）
 * - PluginCommands: 插件命令接口（执行操作）
 */

import type { DeviceState, ListeningMode } from '@shared/types'
import type { Buffer } from 'node:buffer'
import type { AbortReason } from '../protocols/Protocol'
import type { EventBus } from './EventBus'

export interface PluginContext {
  readonly eventBus: EventBus
  getDeviceState: () => DeviceState
  getListeningMode: () => ListeningMode
  isKeepListening: () => boolean
  isAudioChannelOpened: () => boolean
  shouldCaptureAudio: () => boolean
}

export interface PluginCommands {
  startListening: (mode: ListeningMode) => Promise<void>
  stopListening: () => Promise<void>
  abortSpeaking: (reason: AbortReason) => Promise<void>
  sendAudio: (data: Buffer) => Promise<void>
  sendMcpMessage: (message: string) => Promise<void>
  sendWakeWordDetected: (text: string) => Promise<void>
}
