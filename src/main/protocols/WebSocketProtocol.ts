import type { HelloMessage } from './Protocol'
import { Buffer } from 'node:buffer'
import { parseServerMessage } from '@shared/types'
import WebSocket from 'ws'
import { getAudioRuntime } from '../audio/AudioRuntime'
import { getConfigManager } from '../services/configManagerDB'
import { getLogger } from '../utils/logger'
import { Protocol } from './Protocol'
import { isCleanCloseCode } from './wsCloseCodes'
import { closeWsSocket } from './wsCloseSocket'

export { isCleanCloseCode, WS_CLEAN_CLOSE_CODES } from './wsCloseCodes'

const logger = getLogger('WebSocket')

/** 用户在握手完成前取消连接（停止对话 / 关通道） */
const CONNECT_CANCELLED = '连接已取消'

function rawDataToBuffer(data: WebSocket.RawData): Buffer {
  if (Buffer.isBuffer(data))
    return data
  if (Array.isArray(data))
    return Buffer.concat(data)
  return Buffer.from(data)
}

/**
 * WebSocket 协议实现
 */
export class WebSocketProtocol extends Protocol {
  private ws: WebSocket | null = null
  private connected = false
  private isClosing = false
  private isHandlingConnectionLoss = false

  private websocketUrl = ''
  private accessToken = ''
  private deviceId = ''
  private clientId = ''

  private pingInterval: NodeJS.Timeout | null = null
  private pingTimeout: NodeJS.Timeout | null = null
  private readonly PING_INTERVAL = 30000
  private readonly PING_TIMEOUT = 10000

  private messageHandler: ((data: WebSocket.RawData, isBinary: boolean) => void) | null = null
  private closeHandler: ((code: number, reason: Buffer) => void) | null = null
  private errorHandler: ((error: Error) => void) | null = null
  private pongHandler: (() => void) | null = null

  private connectionTimeout: NodeJS.Timeout | null = null
  private helloTimeout: NodeJS.Timeout | null = null
  private serverHelloResolve: (() => void) | null = null
  private pendingConnectReject: ((error: Error) => void) | null = null

  constructor() {
    super()
    this.loadConfig()
  }

  private loadConfig(): boolean {
    const config = getConfigManager()
    this.websocketUrl = config.getWebsocketUrl() || ''
    this.accessToken = config.getWebsocketAccessToken() || ''
    this.deviceId = config.getDeviceId()
    this.clientId = config.getClientId()

    if (!this.websocketUrl) {
      logger.error('WebSocket URL 未配置')
      return false
    }
    return true
  }

  reloadConfig(): boolean {
    logger.info('重新加载 WebSocket 配置')
    const ok = this.loadConfig()
    logger.info('WebSocket 配置已更新', {
      url: this.websocketUrl,
      deviceId: this.deviceId,
      clientId: this.clientId,
    })
    return ok
  }

  async connect(): Promise<boolean> {
    if (this.isClosing) {
      logger.warn('连接正在关闭中，取消新的连接尝试')
      return false
    }

    if (!this.websocketUrl && !this.loadConfig()) {
      this.onNetworkErrorCallback?.('WebSocket URL 未配置')
      return false
    }

    try {
      if (this.ws)
        await this.cleanup()

      const headers: Record<string, string> = {
        'Protocol-Version': '1',
        'Device-Id': this.deviceId,
        'Client-Id': this.clientId,
      }
      if (this.accessToken)
        headers.Authorization = `Bearer ${this.accessToken}`

      logger.info('正在连接...', { url: this.websocketUrl })
      this.ws = new WebSocket(this.websocketUrl, {
        headers,
        handshakeTimeout: 20000,
      })
      this.setupEventListeners()

      return await new Promise<boolean>((resolve, reject) => {
        let settled = false
        const resolveOnce = (value: boolean): void => {
          if (settled)
            return
          settled = true
          this.pendingConnectReject = null
          resolve(value)
        }
        const rejectOnce = (error: Error): void => {
          if (settled)
            return
          settled = true
          this.pendingConnectReject = null
          this.clearConnectionTimers()
          reject(error)
        }
        this.pendingConnectReject = rejectOnce

        this.connectionTimeout = setTimeout(() => {
          rejectOnce(new Error('连接超时'))
        }, 20000)

        this.ws!.once('open', async () => {
          if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout)
            this.connectionTimeout = null
          }

          try {
            // 先挂 hello 等待再发 hello，避免快速回包竞态
            const helloPromise = this.waitForServerHello()
            await this.sendHelloMessage()
            await helloPromise

            this.connected = true
            logger.info('已连接到 WebSocket 服务器')
            this.startHeartbeat()
            resolveOnce(true)
          }
          catch (error) {
            rejectOnce(error instanceof Error ? error : new Error(String(error)))
          }
        })

        this.ws!.once('error', error => rejectOnce(error))
        this.ws!.once('close', (code, reason) => {
          rejectOnce(new Error(`连接在握手期间关闭: ${code} ${reason?.toString()}`))
        })
      })
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const cancelled = error instanceof Error && error.message === CONNECT_CANCELLED
      if (!cancelled) {
        logger.error('连接失败', error)
        await this.cleanup()
        this.onNetworkErrorCallback?.(`无法连接服务: ${errorMessage}`)
      }
      return false
    }
  }

  private waitForServerHello(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.helloTimeout)
        clearTimeout(this.helloTimeout)

      this.helloTimeout = setTimeout(() => {
        this.helloTimeout = null
        this.serverHelloResolve = null
        reject(new Error('等待服务器 hello 响应超时'))
      }, 20000)

      this.serverHelloResolve = () => {
        if (this.helloTimeout) {
          clearTimeout(this.helloTimeout)
          this.helloTimeout = null
        }
        this.serverHelloResolve = null
        resolve()
      }
    })
  }

  private setupEventListeners(): void {
    if (!this.ws)
      return

    this.removeEventListeners()

    this.messageHandler = (data: WebSocket.RawData, isBinary: boolean) => {
      this.handleMessage(data, isBinary)
    }

    this.closeHandler = (code: number, reason: Buffer) => {
      if (this.isClosing)
        return
      const clean = isCleanCloseCode(code)
      const reasonText = reason?.toString() || ''
      logger.info(clean ? '连接已由服务端正常关闭' : '连接已关闭', { code, reason: reasonText })

      if (!this.connected) {
        logger.debug('连接建立前关闭，跳过 handleConnectionLoss（已在 connect 中 reject）')
        return
      }
      void this.handleConnectionLoss(`连接关闭: ${code} ${reasonText}`, { clean })
    }

    this.errorHandler = (error: Error) => {
      logger.error('WebSocket 错误', error)
      if (!this.isClosing && this.connected)
        void this.handleConnectionLoss(`连接错误: ${error.message}`)
    }

    this.pongHandler = () => {
      if (this.pingTimeout) {
        clearTimeout(this.pingTimeout)
        this.pingTimeout = null
      }
    }

    this.ws.on('message', this.messageHandler)
    this.ws.on('close', this.closeHandler)
    this.ws.on('error', this.errorHandler)
    this.ws.on('pong', this.pongHandler)
  }

  private removeEventListeners(): void {
    if (!this.ws)
      return

    if (this.messageHandler) {
      this.ws.off('message', this.messageHandler)
      this.messageHandler = null
    }
    if (this.closeHandler) {
      this.ws.off('close', this.closeHandler)
      this.closeHandler = null
    }
    if (this.errorHandler) {
      this.ws.off('error', this.errorHandler)
      this.errorHandler = null
    }
    if (this.pongHandler) {
      this.ws.off('pong', this.pongHandler)
      this.pongHandler = null
    }
  }

  private clearConnectionTimers(): void {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout)
      this.connectionTimeout = null
    }
    if (this.helloTimeout) {
      clearTimeout(this.helloTimeout)
      this.helloTimeout = null
    }
    this.serverHelloResolve = null
  }

  private handleMessage(data: WebSocket.RawData, isBinary: boolean): void {
    if (isBinary) {
      this.onIncomingAudioCallback?.(rawDataToBuffer(data))
      return
    }

    try {
      const message = rawDataToBuffer(data).toString('utf-8')
      const parsed: unknown = JSON.parse(message)
      const jsonData = parseServerMessage(parsed)
      if (!jsonData) {
        logger.warn('收到无效 JSON 消息，已忽略', parsed)
        return
      }

      if (jsonData.type === 'hello')
        this.handleServerHello(jsonData)
      else
        this.onIncomingJsonCallback?.(jsonData)
    }
    catch (error) {
      logger.error('解析 WebSocket 文本消息失败', error)
    }
  }

  private async sendHelloMessage(): Promise<void> {
    const helloMessage: HelloMessage = {
      type: 'hello',
      version: 1,
      features: { mcp: true },
      transport: 'websocket',
      audio_params: getAudioRuntime().getUplinkParams(),
    }

    logger.debug('发送 hello 消息', helloMessage)
    await this.sendRawText(JSON.stringify(helloMessage))
  }

  private handleServerHello(data: { transport?: string, session_id?: string }): void {
    if (data.transport !== 'websocket') {
      logger.error('不支持的传输方式', { transport: data.transport })
      return
    }

    if (data.session_id)
      this.setSessionId(data.session_id)

    logger.info('成功处理服务器 hello 消息')
    this.serverHelloResolve?.()

    if (this.onAudioChannelOpenedCallback) {
      Promise.resolve(this.onAudioChannelOpenedCallback()).catch((error) => {
        logger.error('音频通道打开回调出错', error)
      })
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()

    this.pingInterval = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.stopHeartbeat()
        return
      }

      try {
        if (this.pingTimeout) {
          clearTimeout(this.pingTimeout)
          this.pingTimeout = null
        }

        this.ws.ping()
        this.pingTimeout = setTimeout(() => {
          this.pingTimeout = null
          logger.warn('心跳 pong 响应超时')
          void this.handleConnectionLoss('心跳超时')
        }, this.PING_TIMEOUT)
      }
      catch (error) {
        logger.error('发送心跳失败', error)
        void this.handleConnectionLoss('心跳发送失败')
      }
    }, this.PING_INTERVAL)
  }

  private stopHeartbeat(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout)
      this.pingTimeout = null
    }
  }

  private async handleConnectionLoss(
    reason: string,
    options: { clean?: boolean } = {},
  ): Promise<void> {
    const clean = options.clean === true
    if (this.isHandlingConnectionLoss) {
      logger.debug('已在处理连接丢失，忽略', { reason, clean })
      return
    }
    this.isHandlingConnectionLoss = true

    try {
      if (clean)
        logger.info('连接已由服务端正常关闭', { reason })
      else
        logger.warn('连接丢失', { reason })

      this.connected = false
      await this.cleanup()

      if (this.onAudioChannelClosedCallback) {
        try {
          await Promise.resolve(this.onAudioChannelClosedCallback())
        }
        catch (error) {
          logger.error('调用音频通道关闭回调失败', error)
        }
      }

      if (!clean)
        this.onNetworkErrorCallback?.(`连接丢失: ${reason}`)
    }
    finally {
      this.isHandlingConnectionLoss = false
    }
  }

  private async cleanup(): Promise<void> {
    this.connected = false
    this.clearConnectionTimers()
    this.stopHeartbeat()

    if (this.pendingConnectReject)
      this.pendingConnectReject(new Error(CONNECT_CANCELLED))

    this.removeEventListeners()

    if (this.ws) {
      try {
        const socket = this.ws
        socket.removeAllListeners()
        closeWsSocket(socket)
      }
      catch (error) {
        logger.error('关闭 WebSocket 时出错', error)
      }
      this.ws = null
    }
  }

  async sendRawText(message: string): Promise<boolean> {
    if (!this.ws || this.isClosing || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn('WebSocket 未就绪，无法发送消息')
      return false
    }

    try {
      this.ws.send(message)
      return true
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('发送文本帧失败', error)
      void this.handleConnectionLoss(`发送文本帧异常: ${errorMessage}`)
      return false
    }
  }

  async sendAudio(data: Buffer): Promise<boolean> {
    if (!this.isAudioChannelOpened())
      return false

    try {
      this.ws!.send(data)
      return true
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('发送音频数据失败', error)
      void this.handleConnectionLoss(`发送音频异常: ${errorMessage}`)
      return false
    }
  }

  isAudioChannelOpened(): boolean {
    return this.ws !== null
      && this.connected
      && !this.isClosing
      && this.ws.readyState === WebSocket.OPEN
  }

  async openAudioChannel(): Promise<boolean> {
    if (this.isAudioChannelOpened())
      return true
    return this.connect()
  }

  async closeAudioChannel(): Promise<void> {
    this.isClosing = true
    try {
      await this.cleanup()
      await this.onAudioChannelClosedCallback?.()
    }
    catch (error) {
      logger.error('关闭音频通道时出错', error)
    }
    finally {
      this.isClosing = false
    }
  }
}
