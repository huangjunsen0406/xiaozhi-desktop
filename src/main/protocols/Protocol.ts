/**
 * Protocol 抽象基类
 * 定义所有通信协议的通用接口
 */
import type { Buffer } from 'node:buffer'
import type { IotDescriptor, JsonMessage, McpPayload } from '../types/protocol'

export enum AbortReason {
  WAKE_WORD_DETECTED = 'wake_word_detected',
  USER_INTERRUPTED = 'user_interrupted',
}

export enum ListeningMode {
  REALTIME = 'realtime',
  AUTO_STOP = 'auto',
  MANUAL = 'manual',
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

export interface ConnectionInfo {
  connected: boolean
  is_closing: boolean
  auto_reconnect_enabled: boolean
  reconnect_attempts: number
  max_reconnect_attempts: number
}

/**
 * Protocol 抽象基类
 */
export abstract class Protocol {
  protected sessionId: string = ''

  // 回调函数
  protected onIncomingJsonCallback?: (data: JsonMessage) => void
  protected onIncomingAudioCallback?: (data: Buffer) => void
  protected onAudioChannelOpenedCallback?: () => void | Promise<void>
  protected onAudioChannelClosedCallback?: () => void | Promise<void>
  protected onNetworkErrorCallback?: (error: string) => void
  protected onConnectionStateChangedCallback?: (connected: boolean, reason: string) => void
  protected onReconnectingCallback?: (attempt: number, maxAttempts: number) => void

  /**
   * 设置 JSON 消息接收回调
   */
  onIncomingJson(callback: (data: JsonMessage) => void): void {
    this.onIncomingJsonCallback = callback
  }

  /**
   * 设置音频数据接收回调
   */
  onIncomingAudio(callback: (data: Buffer) => void): void {
    this.onIncomingAudioCallback = callback
  }

  /**
   * 设置音频通道打开回调
   */
  onAudioChannelOpened(callback: () => void | Promise<void>): void {
    this.onAudioChannelOpenedCallback = callback
  }

  /**
   * 设置音频通道关闭回调
   */
  onAudioChannelClosed(callback: () => void | Promise<void>): void {
    this.onAudioChannelClosedCallback = callback
  }

  /**
   * 设置网络错误回调
   */
  onNetworkError(callback: (error: string) => void): void {
    this.onNetworkErrorCallback = callback
  }

  /**
   * 设置连接状态变化回调
   */
  onConnectionStateChanged(callback: (connected: boolean, reason: string) => void): void {
    this.onConnectionStateChangedCallback = callback
  }

  /**
   * 设置重连尝试回调
   */
  onReconnecting(callback: (attempt: number, maxAttempts: number) => void): void {
    this.onReconnectingCallback = callback
  }

  /**
   * 连接到服务器
   */
  abstract connect(): Promise<boolean>

  /**
   * 发送文本消息
   */
  abstract sendText(message: string): Promise<boolean>

  /**
   * 发送音频数据
   */
  abstract sendAudio(data: Buffer): Promise<boolean>

  /**
   * 检查音频通道是否打开
   */
  abstract isAudioChannelOpened(): boolean

  /**
   * 打开音频通道
   */
  abstract openAudioChannel(): Promise<boolean>

  /**
   * 关闭音频通道
   */
  abstract closeAudioChannel(): Promise<void>

  /**
   * 启用/禁用自动重连
   */
  abstract enableAutoReconnect(enabled: boolean, maxAttempts?: number): void

  /**
   * 获取连接信息
   */
  abstract getConnectionInfo(): ConnectionInfo

  /**
   * 发送中止语音消息
   */
  async sendAbortSpeaking(reason: AbortReason): Promise<boolean> {
    const message: { session_id: string, type: string, reason?: string } = {
      session_id: this.sessionId,
      type: 'abort',
    }

    if (reason === AbortReason.WAKE_WORD_DETECTED) {
      message.reason = 'wake_word_detected'
    }

    return await this.sendText(JSON.stringify(message))
  }

  /**
   * 发送唤醒词检测消息
   */
  async sendWakeWordDetected(wakeWord: string): Promise<boolean> {
    const message = {
      session_id: this.sessionId,
      type: 'listen',
      state: 'detect',
      text: wakeWord,
    }

    return await this.sendText(JSON.stringify(message))
  }

  /**
   * 发送开始监听消息
   */
  async sendStartListening(mode: ListeningMode): Promise<boolean> {
    const message = {
      session_id: this.sessionId,
      type: 'listen',
      state: 'start',
      mode,
    }

    return await this.sendText(JSON.stringify(message))
  }

  /**
   * 发送停止监听消息
   */
  async sendStopListening(): Promise<boolean> {
    const message = {
      session_id: this.sessionId,
      type: 'listen',
      state: 'stop',
    }

    return await this.sendText(JSON.stringify(message))
  }

  /**
   * 发送 IoT 设备描述信息
   */
  async sendIotDescriptors(descriptors: IotDescriptor[] | string): Promise<boolean> {
    try {
      // 解析描述符数据
      let descriptorsData: IotDescriptor[]
      if (typeof descriptors === 'string') {
        descriptorsData = JSON.parse(descriptors)
      }
      else {
        descriptorsData = descriptors
      }

      // 检查是否为数组
      if (!Array.isArray(descriptorsData)) {
        console.error('[Protocol] IoT descriptors 应该是数组')
        return false
      }

      // 为每个描述符发送单独的消息
      for (let i = 0; i < descriptorsData.length; i++) {
        const descriptor = descriptorsData[i]
        if (!descriptor) {
          console.error(`[Protocol] 索引 ${i} 的 IoT descriptor 无效`)
          continue
        }

        const message = {
          session_id: this.sessionId,
          type: 'iot',
          update: true,
          descriptors: [descriptor],
        }

        try {
          const success = await this.sendText(JSON.stringify(message))
          if (!success) {
            console.error(`[Protocol] 发送索引 ${i} 的 IoT descriptor 失败`)
          }
        }
        catch (error) {
          console.error(`[Protocol] 发送索引 ${i} 的 IoT descriptor 异常:`, error)
        }
      }

      return true
    }
    catch (error) {
      console.error('[Protocol] 解析 IoT descriptors 失败:', error)
      return false
    }
  }

  /**
   * 发送 IoT 设备状态信息
   */
  async sendIotStates(states: Record<string, unknown> | string): Promise<boolean> {
    try {
      let statesData: Record<string, unknown>
      if (typeof states === 'string') {
        statesData = JSON.parse(states)
      }
      else {
        statesData = states
      }

      const message = {
        session_id: this.sessionId,
        type: 'iot',
        update: true,
        states: statesData,
      }

      return await this.sendText(JSON.stringify(message))
    }
    catch (error) {
      console.error('[Protocol] 发送 IoT states 失败:', error)
      return false
    }
  }

  /**
   * 发送 MCP 消息
   */
  async sendMcpMessage(payload: McpPayload | string): Promise<boolean> {
    try {
      let payloadData: McpPayload
      if (typeof payload === 'string') {
        payloadData = JSON.parse(payload)
      }
      else {
        payloadData = payload
      }

      const message = {
        session_id: this.sessionId,
        type: 'mcp',
        payload: payloadData,
      }

      return await this.sendText(JSON.stringify(message))
    }
    catch (error) {
      console.error('[Protocol] 发送 MCP message 失败:', error)
      return false
    }
  }

  /**
   * 获取会话 ID
   */
  getSessionId(): string {
    return this.sessionId
  }

  /**
   * 设置会话 ID
   */
  protected setSessionId(sessionId: string): void {
    this.sessionId = sessionId
  }
}
