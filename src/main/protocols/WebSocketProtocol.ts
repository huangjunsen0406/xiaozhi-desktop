import type { ConnectionInfo, HelloMessage } from './Protocol'
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

/**
 * WebSocket 协议实现
 */
export class WebSocketProtocol extends Protocol {
  private ws: WebSocket | null = null
  private connected: boolean = false
  private helloReceived: boolean = false
  private isClosing: boolean = false

  // 自动重连配置
  private reconnectAttempts: number = 0
  private maxReconnectAttempts: number = 0
  private autoReconnectEnabled: boolean = false

  // 配置
  private websocketUrl: string = ''
  private accessToken: string = ''
  private deviceId: string = ''
  private clientId: string = ''

  // 心跳检测
  private pingInterval: NodeJS.Timeout | null = null
  private pingTimeout: NodeJS.Timeout | null = null
  private readonly PING_INTERVAL = 30000 // 30秒
  private readonly PING_TIMEOUT = 10000 // 10秒

  // ========== 事件监听器引用（用于清理） ==========
  private messageHandler: ((data: WebSocket.Data) => void) | null = null
  private closeHandler: ((code: number, reason: Buffer) => void) | null = null
  private errorHandler: ((error: Error) => void) | null = null
  private pingHandler: (() => void) | null = null
  private pongHandler: (() => void) | null = null

  // ========== 连接过程中的定时器引用 ==========
  private connectionTimeout: NodeJS.Timeout | null = null
  private helloTimeout: NodeJS.Timeout | null = null
  private helloCheckInterval: NodeJS.Timeout | null = null

  // ========== 重连控制 ==========
  private reconnectDelayTimeout: NodeJS.Timeout | null = null
  private isHandlingConnectionLoss: boolean = false

  /** 握手未完成就被取消时，用来结束 connect() 的 Promise，避免 connectLock 永久挂起 */
  private pendingConnectReject: ((error: Error) => void) | null = null

  constructor() {
    super()
    this.loadConfig()
  }

  /**
   * 加载配置
   */
  private loadConfig(): void {
    const config = getConfigManager()
    this.websocketUrl = config.getWebsocketUrl() || ''
    this.accessToken = config.getWebsocketAccessToken() || ''
    this.deviceId = config.getDeviceId()
    this.clientId = config.getClientId()

    if (!this.websocketUrl) {
      logger.error('WebSocket URL 未配置')
    }
  }

  /**
   * 重新加载配置（用于配置更新后刷新）
   */
  reloadConfig(): void {
    logger.info('重新加载 WebSocket 配置')
    this.loadConfig()
    logger.info('WebSocket 配置已更新', {
      url: this.websocketUrl,
      deviceId: this.deviceId,
      clientId: this.clientId,
    })
  }

  /**
   * 连接到 WebSocket 服务器
   */
  async connect(): Promise<boolean> {
    if (this.isClosing) {
      logger.warn('连接正在关闭中，取消新的连接尝试')
      return false
    }

    if (!this.websocketUrl) {
      logger.error('WebSocket URL 未配置')
      if (this.onNetworkErrorCallback) {
        this.onNetworkErrorCallback('WebSocket URL 未配置')
      }
      return false
    }

    try {
      // 重连前先彻底清理旧连接
      if (this.ws) {
        await this.cleanup()
      }

      // 重置状态
      this.helloReceived = false

      // 构建请求头
      const headers: Record<string, string> = {
        'Protocol-Version': '1',
        'Device-Id': this.deviceId,
        'Client-Id': this.clientId,
      }

      if (this.accessToken) {
        headers.Authorization = `Bearer ${this.accessToken}`
      }

      logger.info('正在连接...', { url: this.websocketUrl })

      // 创建 WebSocket 连接
      this.ws = new WebSocket(this.websocketUrl, {
        headers,
        handshakeTimeout: 20000,
      })

      // 设置事件监听器
      this.setupEventListeners()

      // 必须 await：拒绝会被本函数 catch 收成 false，避免取消连接冒成未处理异常
      return await new Promise((resolve, reject) => {
        let settled = false
        const resolveOnce = (value: boolean) => {
          if (settled)
            return
          settled = true
          this.pendingConnectReject = null
          resolve(value)
        }
        const rejectOnce = (error: Error) => {
          if (settled)
            return
          settled = true
          this.pendingConnectReject = null
          this.clearConnectionTimers()
          reject(error)
        }
        this.pendingConnectReject = rejectOnce

        // 使用类成员保存定时器引用
        this.connectionTimeout = setTimeout(() => {
          rejectOnce(new Error('连接超时'))
        }, 20000)

        this.ws!.once('open', async () => {
          // 清理连接超时定时器
          if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout)
            this.connectionTimeout = null
          }

          try {
            // 发送 hello 消息
            await this.sendHelloMessage()

            // 使用 Promise 等待 hello 响应（替代轮询）
            await new Promise<void>((resolveHello, rejectHello) => {
              // 设置超时
              this.helloTimeout = setTimeout(() => {
                this.helloTimeout = null
                rejectHello(new Error('等待服务器 hello 响应超时'))
              }, 20000)

              // 轮询检查（保留兼容性，但减少频率）
              this.helloCheckInterval = setInterval(() => {
                if (this.helloReceived) {
                  if (this.helloTimeout) {
                    clearTimeout(this.helloTimeout)
                    this.helloTimeout = null
                  }
                  if (this.helloCheckInterval) {
                    clearInterval(this.helloCheckInterval)
                    this.helloCheckInterval = null
                  }
                  resolveHello()
                }
              }, 50) // 减少轮询间隔到 50ms
            })

            // hello 握手成功
            this.connected = true
            this.reconnectAttempts = 0
            logger.info('已连接到 WebSocket 服务器')

            // 启动心跳
            this.startHeartbeat()

            // 通知连接状态变化
            if (this.onConnectionStateChangedCallback) {
              this.onConnectionStateChangedCallback(true, '连接成功')
            }

            resolveOnce(true)
          }
          catch (error) {
            rejectOnce(error instanceof Error ? error : new Error(String(error)))
          }
        })

        this.ws!.once('error', (error) => {
          rejectOnce(error)
        })

        // 处理握手期间连接关闭（如服务端主动断开）
        this.ws!.once('close', (code, reason) => {
          rejectOnce(new Error(`连接在握手期间关闭: ${code} ${reason?.toString()}`))
        })
      })
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const cancelled = error instanceof Error && error.message === CONNECT_CANCELLED
      if (!cancelled)
        logger.error('连接失败', error)
      // 取消来自 cleanup() 本身，再清一次会拆掉随后新建的连接
      if (!cancelled)
        await this.cleanup()
      if (!cancelled && this.onNetworkErrorCallback) {
        this.onNetworkErrorCallback(`无法连接服务: ${errorMessage}`)
      }
      return false
    }
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    if (!this.ws)
      return

    // 先移除旧监听器（防止重复注册）
    this.removeEventListeners()

    // 创建并保存监听器引用
    this.messageHandler = (data: WebSocket.Data) => {
      this.handleMessage(data)
    }

    this.closeHandler = (code: number, reason: Buffer) => {
      if (!this.isClosing) {
        const clean = isCleanCloseCode(code)
        const reasonText = reason?.toString() || ''
        if (clean) {
          logger.info('连接已由服务端正常关闭', { code, reason: reasonText })
        }
        else {
          logger.info('连接已关闭', { code, reason: reasonText })
        }
        // 如果连接尚未建立成功，说明 close 事件已在 connect() 的 once 中处理
        if (!this.connected) {
          logger.debug('连接建立前关闭，跳过 handleConnectionLoss（已在 connect 中 reject）')
          return
        }
        this.handleConnectionLoss(
          `连接关闭: ${code} ${reasonText}`,
          { clean },
        )
      }
    }

    this.errorHandler = (error: Error) => {
      logger.error('WebSocket 错误', error)
      if (!this.isClosing) {
        this.handleConnectionLoss(`连接错误: ${error.message}`)
      }
    }

    this.pingHandler = () => {
      // ws 库会自动回复 pong，这里仅用于日志或扩展
    }

    this.pongHandler = () => {
      // 收到 pong 响应，清除超时
      if (this.pingTimeout) {
        clearTimeout(this.pingTimeout)
        this.pingTimeout = null
      }
    }

    // 注册监听器
    this.ws.on('message', this.messageHandler)
    this.ws.on('close', this.closeHandler)
    this.ws.on('error', this.errorHandler)
    this.ws.on('ping', this.pingHandler)
    this.ws.on('pong', this.pongHandler)
  }

  /**
   * 移除事件监听器
   */
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
    if (this.pingHandler) {
      this.ws.off('ping', this.pingHandler)
      this.pingHandler = null
    }
    if (this.pongHandler) {
      this.ws.off('pong', this.pongHandler)
      this.pongHandler = null
    }
  }

  /**
   * 清理所有连接相关的定时器
   */
  private clearConnectionTimers(): void {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout)
      this.connectionTimeout = null
    }
    if (this.helloTimeout) {
      clearTimeout(this.helloTimeout)
      this.helloTimeout = null
    }
    if (this.helloCheckInterval) {
      clearInterval(this.helloCheckInterval)
      this.helloCheckInterval = null
    }
  }

  /**
   * 处理接收到的消息
   */
  private handleMessage(data: WebSocket.Data): void {
    try {
      if (typeof data === 'string' || Buffer.isBuffer(data)) {
        const message = data.toString()
        try {
          const parsed: unknown = JSON.parse(message)
          const jsonData = parseServerMessage(parsed)
          if (!jsonData) {
            logger.warn('收到无效 JSON 消息，已忽略', parsed)
            return
          }
          const msgType = jsonData.type

          if (msgType === 'hello') {
            this.handleServerHello(jsonData)
          }
          else {
            // 其他 JSON 消息
            if (this.onIncomingJsonCallback) {
              this.onIncomingJsonCallback(jsonData)
            }
          }
        }
        catch {
          // 不是 JSON,可能是二进制音频数据
          if (Buffer.isBuffer(data) && this.onIncomingAudioCallback) {
            this.onIncomingAudioCallback(data)
          }
        }
      }
    }
    catch (error) {
      logger.error('处理消息时出错', error)
    }
  }

  /**
   * 发送 hello 消息
   */
  private async sendHelloMessage(): Promise<void> {
    // features.aec 服务端已废弃，不再上报；audio_params 仅来自 AudioRuntime
    // 本地 AEC 仍由 Chromium/设置页控制，不进入 hello
    const helloMessage: HelloMessage = {
      type: 'hello',
      version: 1,
      features: {
        mcp: true,
      },
      transport: 'websocket',
      audio_params: getAudioRuntime().getUplinkParams(),
    }

    logger.debug('发送 hello 消息', helloMessage)

    await this.sendRawText(JSON.stringify(helloMessage))
  }

  /**
   * 处理服务器 hello 消息
   */
  private handleServerHello(data: { transport?: string, session_id?: string }): void {
    try {
      const transport = data.transport
      if (transport !== 'websocket') {
        logger.error('不支持的传输方式', { transport })
        return
      }

      // 保存会话 ID
      if (data.session_id) {
        this.setSessionId(data.session_id)
      }

      this.helloReceived = true
      logger.info('成功处理服务器 hello 消息')

      // 通知音频通道已打开
      if (this.onAudioChannelOpenedCallback) {
        Promise.resolve(this.onAudioChannelOpenedCallback()).catch((error) => {
          logger.error('音频通道打开回调出错', error)
        })
      }
    }
    catch (error) {
      logger.error('处理服务器 hello 消息时出错', error)
      if (this.onNetworkErrorCallback) {
        this.onNetworkErrorCallback(`处理服务器响应失败: ${error}`)
      }
    }
  }

  /**
   * 启动心跳检测
   */
  private startHeartbeat(): void {
    this.stopHeartbeat()

    this.pingInterval = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.stopHeartbeat()
        return
      }

      try {
        // 发送新 ping 前先清理旧的 timeout（防止覆盖导致泄漏）
        if (this.pingTimeout) {
          clearTimeout(this.pingTimeout)
          this.pingTimeout = null
        }

        this.ws.ping()

        // 设置 pong 超时
        this.pingTimeout = setTimeout(() => {
          this.pingTimeout = null
          logger.warn('心跳 pong 响应超时')
          this.handleConnectionLoss('心跳超时')
        }, this.PING_TIMEOUT)
      }
      catch (error) {
        logger.error('发送心跳失败', error)
        this.handleConnectionLoss('心跳发送失败')
      }
    }, this.PING_INTERVAL)
  }

  /**
   * 停止心跳检测
   */
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

  /**
   * 处理连接丢失
   *
   * @param reason 丢失原因
   * @param options 选项
   * @param options.clean 服务端正常关闭（1000/1001/1005）。只收回通道，
   *                      不触发自动重连，也不上报网络错误（对齐 py）。
   */
  private async handleConnectionLoss(
    reason: string,
    options: { clean?: boolean } = {},
  ): Promise<void> {
    const clean = options.clean === true

    // 防止重复调用
    if (this.isHandlingConnectionLoss) {
      logger.debug('已在处理连接丢失，忽略', { reason, clean })
      return
    }
    this.isHandlingConnectionLoss = true

    if (clean) {
      logger.info('连接已由服务端正常关闭', { reason })
    }
    else {
      logger.warn('连接丢失', { reason })
    }

    const wasConnected = this.connected
    this.connected = false

    // 通知连接状态变化
    if (this.onConnectionStateChangedCallback && wasConnected) {
      try {
        this.onConnectionStateChangedCallback(false, reason)
      }
      catch (error) {
        logger.error('调用连接状态变化回调失败', error)
      }
    }

    // 清理连接
    await this.cleanup()

    // 通知音频通道关闭
    if (this.onAudioChannelClosedCallback) {
      try {
        await Promise.resolve(this.onAudioChannelClosedCallback())
      }
      catch (error) {
        logger.error('调用音频通道关闭回调失败', error)
      }
    }

    // 服务端正常关闭：会话结束不算故障，不重连也不报错；
    // 下次交互时按需重新 openAudioChannel
    if (clean) {
      this.isHandlingConnectionLoss = false
      return
    }

    // 尝试自动重连
    if (!this.isClosing && this.autoReconnectEnabled && this.reconnectAttempts < this.maxReconnectAttempts) {
      await this.attemptReconnect(reason)
    }
    else {
      // 通知网络错误
      if (this.onNetworkErrorCallback) {
        if (this.autoReconnectEnabled && this.reconnectAttempts >= this.maxReconnectAttempts) {
          this.onNetworkErrorCallback(`连接丢失且重连失败: ${reason}`)
        }
        else {
          this.onNetworkErrorCallback(`连接丢失: ${reason}`)
        }
      }
    }

    this.isHandlingConnectionLoss = false
  }

  /**
   * 尝试自动重连
   */
  private async attemptReconnect(originalReason: string): Promise<void> {
    this.reconnectAttempts++

    // 通知开始重连
    if (this.onReconnectingCallback) {
      try {
        this.onReconnectingCallback(this.reconnectAttempts, this.maxReconnectAttempts)
      }
      catch (error) {
        logger.error('调用重连回调失败', error)
      }
    }

    logger.info('尝试自动重连', {
      attempt: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts,
    })

    // 指数退避,最大 30 秒（使用可取消的延迟）
    const delay = Math.min(this.reconnectAttempts * 2000, 30000)
    await new Promise<void>((resolve) => {
      this.reconnectDelayTimeout = setTimeout(() => {
        this.reconnectDelayTimeout = null
        resolve()
      }, delay)
    })

    // 如果在等待期间被取消，直接返回
    if (this.isClosing) {
      logger.info('重连被取消')
      return
    }

    try {
      const success = await this.connect()
      if (success) {
        logger.info('自动重连成功')
        if (this.onConnectionStateChangedCallback) {
          this.onConnectionStateChangedCallback(true, '重连成功')
        }
      }
      else {
        logger.warn('自动重连失败', {
          attempt: this.reconnectAttempts,
          maxAttempts: this.maxReconnectAttempts,
        })
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          if (this.onNetworkErrorCallback) {
            this.onNetworkErrorCallback(`重连失败，已达到最大重连次数: ${originalReason}`)
          }
        }
      }
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('重连过程中出错', error)
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        if (this.onNetworkErrorCallback) {
          this.onNetworkErrorCallback(`重连异常: ${errorMessage}`)
        }
      }
    }
  }

  /**
   * 清理连接资源
   *
   * 清理顺序：
   * 1. 重置状态标志
   * 2. 清理所有定时器（连接定时器 + 心跳定时器）
   * 3. 移除所有事件监听器
   * 4. 关闭 WebSocket 连接
   */
  private async cleanup(): Promise<void> {
    this.connected = false
    this.helloReceived = false

    // 清理连接过程中的定时器
    this.clearConnectionTimers()

    // 停止心跳定时器
    this.stopHeartbeat()

    // 取消重连延迟
    if (this.reconnectDelayTimeout) {
      clearTimeout(this.reconnectDelayTimeout)
      this.reconnectDelayTimeout = null
    }

    // 握手中被取消：先结束 connect()，避免监听被卸掉后 Promise / connectLock 永久挂起
    if (this.pendingConnectReject) {
      this.pendingConnectReject(new Error(CONNECT_CANCELLED))
    }

    // 移除事件监听器
    this.removeEventListeners()

    // 关闭 WebSocket
    if (this.ws) {
      try {
        const socket = this.ws
        // 先卸掉业务监听，避免 close 再触发 handleConnectionLoss
        socket.removeAllListeners()
        closeWsSocket(socket)
      }
      catch (error) {
        logger.error('关闭 WebSocket 时出错', error)
      }
      this.ws = null
    }
  }

  /**
   * 发送传输层文本帧（已序列化的协议 JSON 字符串）
   */
  async sendRawText(message: string): Promise<boolean> {
    if (!this.ws || this.isClosing) {
      logger.warn('WebSocket 未连接或正在关闭，无法发送消息')
      return false
    }

    if (this.ws.readyState !== WebSocket.OPEN) {
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
      this.handleConnectionLoss(`发送文本帧异常: ${errorMessage}`)
      return false
    }
  }

  /**
   * 发送音频数据
   */
  async sendAudio(data: Buffer): Promise<boolean> {
    if (!this.isAudioChannelOpened()) {
      return false
    }

    try {
      this.ws!.send(data)
      return true
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('发送音频数据失败', error)
      this.handleConnectionLoss(`发送音频异常: ${errorMessage}`)
      return false
    }
  }

  /**
   * 检查音频通道是否打开
   */
  isAudioChannelOpened(): boolean {
    if (!this.ws || !this.connected || this.isClosing) {
      return false
    }

    try {
      return this.ws.readyState === WebSocket.OPEN
    }
    catch {
      return false
    }
  }

  /**
   * 打开音频通道
   */
  async openAudioChannel(): Promise<boolean> {
    if (!this.isAudioChannelOpened()) {
      return await this.connect()
    }
    return true
  }

  /**
   * 关闭音频通道
   */
  async closeAudioChannel(): Promise<void> {
    this.isClosing = true

    try {
      await this.cleanup()

      if (this.onAudioChannelClosedCallback) {
        await Promise.resolve(this.onAudioChannelClosedCallback())
      }
    }
    catch (error) {
      logger.error('关闭音频通道失败', error)
    }
    finally {
      this.isClosing = false
    }
  }

  /**
   * 启用/禁用自动重连
   */
  enableAutoReconnect(enabled: boolean, maxAttempts: number = 5): void {
    this.autoReconnectEnabled = enabled
    if (enabled) {
      this.maxReconnectAttempts = maxAttempts
      logger.info('启用自动重连', { maxAttempts })
    }
    else {
      this.maxReconnectAttempts = 0
      logger.info('禁用自动重连')
    }
  }

  /**
   * 获取连接信息
   */
  getConnectionInfo(): ConnectionInfo {
    return {
      connected: this.connected,
      is_closing: this.isClosing,
      auto_reconnect_enabled: this.autoReconnectEnabled,
      reconnect_attempts: this.reconnectAttempts,
      max_reconnect_attempts: this.maxReconnectAttempts,
    }
  }
}
