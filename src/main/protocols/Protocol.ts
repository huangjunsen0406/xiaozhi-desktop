import type { ListeningMode, ServerMcpPayload, ServerMessage } from '@shared/types'
import type { Buffer } from 'node:buffer'
import { getLogger } from '../utils/logger'

const logger = getLogger('Protocol')

export enum AbortReason {
  WAKE_WORD_DETECTED = 'wake_word_detected',
  USER_INTERRUPTED = 'user_interrupted',
}

export interface AudioParams {
  format: string
  sample_rate: number
  channels: number
  frame_duration: number
}

export interface HelloMessage {
  type: 'hello'
  version: number
  features: {
    mcp: boolean
  }
  transport: 'websocket' | 'udp'
  audio_params: AudioParams
}

/**
 * Protocol 抽象基类
 */
export abstract class Protocol {
  protected sessionId: string = ''

  protected onIncomingJsonCallback?: (data: ServerMessage) => void
  protected onIncomingAudioCallback?: (data: Buffer) => void
  protected onAudioChannelOpenedCallback?: () => void | Promise<void>
  protected onAudioChannelClosedCallback?: () => void | Promise<void>
  protected onNetworkErrorCallback?: (error: string) => void

  onIncomingJson(callback: (data: ServerMessage) => void): void {
    this.onIncomingJsonCallback = callback
  }

  onIncomingAudio(callback: (data: Buffer) => void): void {
    this.onIncomingAudioCallback = callback
  }

  onAudioChannelOpened(callback: () => void | Promise<void>): void {
    this.onAudioChannelOpenedCallback = callback
  }

  onAudioChannelClosed(callback: () => void | Promise<void>): void {
    this.onAudioChannelClosedCallback = callback
  }

  onNetworkError(callback: (error: string) => void): void {
    this.onNetworkErrorCallback = callback
  }

  abstract connect(): Promise<boolean>
  abstract reloadConfig(): boolean
  abstract sendRawText(message: string): Promise<boolean>
  abstract sendAudio(data: Buffer): Promise<boolean>
  abstract isAudioChannelOpened(): boolean
  abstract openAudioChannel(): Promise<boolean>
  abstract closeAudioChannel(): Promise<void>

  async sendAbortSpeaking(reason: AbortReason): Promise<boolean> {
    const message: { session_id: string, type: string, reason?: string } = {
      session_id: this.sessionId,
      type: 'abort',
    }
    if (reason === AbortReason.WAKE_WORD_DETECTED || reason === AbortReason.USER_INTERRUPTED) {
      message.reason = reason
    }
    return this.sendRawText(JSON.stringify(message))
  }

  async sendWakeWordDetected(wakeWord: string): Promise<boolean> {
    return this.sendRawText(JSON.stringify({
      session_id: this.sessionId,
      type: 'listen',
      state: 'detect',
      text: wakeWord,
    }))
  }

  async sendStartListening(mode: ListeningMode): Promise<boolean> {
    return this.sendRawText(JSON.stringify({
      session_id: this.sessionId,
      type: 'listen',
      state: 'start',
      mode,
    }))
  }

  async sendStopListening(): Promise<boolean> {
    return this.sendRawText(JSON.stringify({
      session_id: this.sessionId,
      type: 'listen',
      state: 'stop',
    }))
  }

  async sendMcpMessage(payload: ServerMcpPayload | string): Promise<boolean> {
    try {
      const payloadData: ServerMcpPayload = typeof payload === 'string'
        ? JSON.parse(payload)
        : payload

      const message = {
        session_id: this.sessionId,
        type: 'mcp',
        payload: payloadData,
      }

      logger.info('发送 MCP 响应:', JSON.stringify(message))
      return await this.sendRawText(JSON.stringify(message))
    }
    catch (error) {
      logger.error('发送 MCP message 失败', error)
      return false
    }
  }

  getSessionId(): string {
    return this.sessionId
  }

  protected setSessionId(sessionId: string): void {
    this.sessionId = sessionId
  }
}
