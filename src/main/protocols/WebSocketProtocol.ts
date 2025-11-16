import WebSocket from 'ws'
import { getConfigManager } from '../services/configManagerDB'
import type { ConnectionInfo, HelloMessage } from './Protocol'
import { Protocol } from './Protocol'

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
      console.error('[WebSocketProtocol] WebSocket URL 未配置')
    }
  }

  /**
   * 连接到 WebSocket 服务器
   */
  async connect(): Promise<boolean> {
    if (this.isClosing) {
      console.warn('[WebSocketProtocol] 连接正在关闭中，取消新的连接尝试')
      return false
    }

    if (!this.websocketUrl) {
      console.error('[WebSocketProtocol] WebSocket URL 未配置')
      if (this.onNetworkErrorCallback) {
        this.onNetworkErrorCallback('WebSocket URL 未配置')
      }
      return false
    }

    try {
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

      console.log('[WebSocketProtocol] 正在连接...', this.websocketUrl)

      // 创建 WebSocket 连接
      this.ws = new WebSocket(this.websocketUrl, {
        headers,
        handshakeTimeout: 10000,
      })

      // 设置事件监听器
      this.setupEventListeners()

      // 等待连接建立
      return new Promise((resolve, reject) => {
        const connectionTimeout = setTimeout(() => {
          reject(new Error('连接超时'))
        }, 10000)

        this.ws!.once('open', async () => {
          clearTimeout(connectionTimeout)

          try {
            // 发送 hello 消息
            await this.sendHelloMessage()

            // 等待服务器 hello 响应
            const helloTimeout = setTimeout(() => {
              reject(new Error('等待服务器 hello 响应超时'))
            }, 10000)

            const checkHello = setInterval(() => {
              if (this.helloReceived) {
                clearTimeout(helloTimeout)
                clearInterval(checkHello)

                this.connected = true
                this.reconnectAttempts = 0
                console.log('[WebSocketProtocol] 已连接到 WebSocket 服务器')

                // 启动心跳
                this.startHeartbeat()

                // 通知连接状态变化
                if (this.onConnectionStateChangedCallback) {
                  this.onConnectionStateChangedCallback(true, '连接成功')
                }

                resolve(true)
              }
            }, 100)
          }
          catch (error) {
            clearTimeout(connectionTimeout)
            reject(error)
          }
        })

        this.ws!.once('error', (error) => {
          clearTimeout(connectionTimeout)
          reject(error)
        })
      })
    }
    catch (error: any) {
      console.error('[WebSocketProtocol] 连接失败:', error)
      await this.cleanup()
      if (this.onNetworkErrorCallback) {
        this.onNetworkErrorCallback(`无法连接服务: ${error.message}`)
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

    this.ws.on('message', (data: WebSocket.Data) => {
      this.handleMessage(data)
    })

    this.ws.on('close', (code: number, reason: Buffer) => {
      if (!this.isClosing) {
        console.log(`[WebSocketProtocol] 连接已关闭: ${code} ${reason.toString()}`)
        this.handleConnectionLoss(`连接关闭: ${code} ${reason.toString()}`)
      }
    })

    this.ws.on('error', (error: Error) => {
      console.error('[WebSocketProtocol] WebSocket 错误:', error)
      if (!this.isClosing) {
        this.handleConnectionLoss(`连接错误: ${error.message}`)
      }
    })

    this.ws.on('ping', () => {
      // 收到服务器 ping,自动回复 pong
      this.ws?.pong()
    })

    this.ws.on('pong', () => {
      // 收到 pong 响应,清除超时
      if (this.pingTimeout) {
        clearTimeout(this.pingTimeout)
        this.pingTimeout = null
      }
    })
  }

  /**
   * 处理接收到的消息
   */
  private handleMessage(data: WebSocket.Data): void {
    try {
      if (typeof data === 'string' || Buffer.isBuffer(data)) {
        const message = data.toString()
        try {
          const jsonData = JSON.parse(message)
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
      else if (Buffer.isBuffer(data)) {
        // 二进制消息 - 音频数据
        if (this.onIncomingAudioCallback) {
          this.onIncomingAudioCallback(data)
        }
      }
    }
    catch (error) {
      console.error('[WebSocketProtocol] 处理消息时出错:', error)
    }
  }

  /**
   * 发送 hello 消息
   */
  private async sendHelloMessage(): Promise<void> {
    const helloMessage: HelloMessage = {
      type: 'hello',
      version: 1,
      features: {
        mcp: true,
      },
      transport: 'websocket',
      audio_params: {
        format: 'opus',
        sample_rate: 16000,
        channels: 1,
        frame_duration: 20,
      },
    }

    await this.sendText(JSON.stringify(helloMessage))
  }

  /**
   * 处理服务器 hello 消息
   */
  private handleServerHello(data: any): void {
    try {
      const transport = data.transport
      if (transport !== 'websocket') {
        console.error(`[WebSocketProtocol] 不支持的传输方式: ${transport}`)
        return
      }

      // 保存会话 ID
      if (data.session_id) {
        this.setSessionId(data.session_id)
      }

      this.helloReceived = true
      console.log('[WebSocketProtocol] 成功处理服务器 hello 消息')

      // 通知音频通道已打开
      if (this.onAudioChannelOpenedCallback) {
        Promise.resolve(this.onAudioChannelOpenedCallback()).catch((error) => {
          console.error('[WebSocketProtocol] 音频通道打开回调出错:', error)
        })
      }
    }
    catch (error) {
      console.error('[WebSocketProtocol] 处理服务器 hello 消息时出错:', error)
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
        this.ws.ping()

        // 设置 pong 超时
        this.pingTimeout = setTimeout(() => {
          console.warn('[WebSocketProtocol] 心跳 pong 响应超时')
          this.handleConnectionLoss('心跳超时')
        }, this.PING_TIMEOUT)
      }
      catch (error) {
        console.error('[WebSocketProtocol] 发送心跳失败:', error)
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
   */
  private async handleConnectionLoss(reason: string): Promise<void> {
    console.warn(`[WebSocketProtocol] 连接丢失: ${reason}`)

    const wasConnected = this.connected
    this.connected = false

    // 通知连接状态变化
    if (this.onConnectionStateChangedCallback && wasConnected) {
      try {
        this.onConnectionStateChangedCallback(false, reason)
      }
      catch (error) {
        console.error('[WebSocketProtocol] 调用连接状态变化回调失败:', error)
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
        console.error('[WebSocketProtocol] 调用音频通道关闭回调失败:', error)
      }
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
        console.error('[WebSocketProtocol] 调用重连回调失败:', error)
      }
    }

    console.log(`[WebSocketProtocol] 尝试自动重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})`)

    // 指数退避,最大 30 秒
    const delay = Math.min(this.reconnectAttempts * 2000, 30000)
    await new Promise(resolve => setTimeout(resolve, delay))

    try {
      const success = await this.connect()
      if (success) {
        console.log('[WebSocketProtocol] 自动重连成功')
        if (this.onConnectionStateChangedCallback) {
          this.onConnectionStateChangedCallback(true, '重连成功')
        }
      }
      else {
        console.warn(`[WebSocketProtocol] 自动重连失败 (${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          if (this.onNetworkErrorCallback) {
            this.onNetworkErrorCallback(`重连失败，已达到最大重连次数: ${originalReason}`)
          }
        }
      }
    }
    catch (error: any) {
      console.error('[WebSocketProtocol] 重连过程中出错:', error)
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        if (this.onNetworkErrorCallback) {
          this.onNetworkErrorCallback(`重连异常: ${error.message}`)
        }
      }
    }
  }

  /**
   * 清理连接资源
   */
  private async cleanup(): Promise<void> {
    this.connected = false
    this.helloReceived = false

    // 停止心跳
    this.stopHeartbeat()

    // 关闭 WebSocket
    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.close()
        }
      }
      catch (error) {
        console.error('[WebSocketProtocol] 关闭 WebSocket 时出错:', error)
      }
      this.ws = null
    }
  }

  /**
   * 发送文本消息
   */
  async sendText(message: string): Promise<boolean> {
    if (!this.ws || this.isClosing) {
      console.warn('[WebSocketProtocol] WebSocket 未连接或正在关闭，无法发送消息')
      return false
    }

    if (this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[WebSocketProtocol] WebSocket 未就绪，无法发送消息')
      return false
    }

    try {
      this.ws.send(message)
      return true
    }
    catch (error: any) {
      console.error('[WebSocketProtocol] 发送文本消息失败:', error)
      this.handleConnectionLoss(`发送文本异常: ${error.message}`)
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
    catch (error: any) {
      console.error('[WebSocketProtocol] 发送音频数据失败:', error)
      this.handleConnectionLoss(`发送音频异常: ${error.message}`)
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
      console.error('[WebSocketProtocol] 关闭音频通道失败:', error)
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
      console.log(`[WebSocketProtocol] 启用自动重连，最大尝试次数: ${maxAttempts}`)
    }
    else {
      this.maxReconnectAttempts = 0
      console.log('[WebSocketProtocol] 禁用自动重连')
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
