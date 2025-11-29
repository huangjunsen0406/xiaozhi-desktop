/**
 * MQTT 协议实现
 * 支持 MQTT over TLS 和 UDP 音频传输
 */
import type { ConnectionInfo, HelloMessage } from './Protocol'
import { Buffer } from 'node:buffer'
import * as crypto from 'node:crypto'
import * as dgram from 'node:dgram'
import * as mqtt from 'mqtt'
import { getConfigManager } from '../services/configManagerDB'
import { Protocol } from './Protocol'

/**
 * UDP 配置
 */
interface UdpConfig {
  server: string
  port: number
  key: string
  nonce: string
}

/**
 * MQTT 配置
 */
interface MqttConfig {
  endpoint: string
  client_id: string
  username: string
  password: string
  publish_topic: string
  subscribe_topic: string | null
}

/**
 * MQTT 协议实现
 */
export class MqttProtocol extends Protocol {
  // MQTT 客户端
  private mqttClient: mqtt.MqttClient | null = null
  private connected: boolean = false
  private isClosing: boolean = false

  // MQTT 配置
  private endpoint: string = ''
  private clientId: string = ''
  private username: string = ''
  private password: string = ''
  private publishTopic: string = ''
  private subscribeTopic: string | null = null

  // UDP 配置和实例
  private udpSocket: dgram.Socket | null = null
  private udpServer: string = ''
  private udpPort: number = 0
  private aesKey: Buffer | null = null
  private aesNonce: Buffer | null = null
  private localSequence: number = 0
  private udpRunning: boolean = false

  // Hello 握手
  private helloPromise: Promise<void> | null = null
  private helloResolve: (() => void) | null = null
  private helloReject: ((error: Error) => void) | null = null

  // 自动重连
  private reconnectAttempts: number = 0
  private maxReconnectAttempts: number = 0
  private autoReconnectEnabled: boolean = false

  // 连接监控
  private lastActivityTime: number = 0
  private keepAliveInterval: number = 60 * 1000 // 60 秒
  private connectionTimeout: number = 120 * 1000 // 120 秒
  private connectionMonitorTimer: NodeJS.Timeout | null = null
  private isHandlingConnectionLoss: boolean = false

  constructor() {
    super()
  }

  /**
   * 连接到 MQTT 服务器
   */
  async connect(): Promise<boolean> {
    if (this.isClosing) {
      console.warn('[MqttProtocol] 连接正在关闭中，取消新的连接尝试')
      return false
    }

    try {
      // 加载 MQTT 配置
      const mqttConfig = await this.loadMqttConfig()
      if (!mqttConfig) {
        return false
      }

      // 解析 endpoint
      const { host, port, useTls } = this.parseEndpoint(this.endpoint)

      console.log(`[MqttProtocol] 正在连接 MQTT 服务器: ${host}:${port} (TLS: ${useTls})`)

      // 清理旧连接
      if (this.mqttClient) {
        await this.cleanup()
      }

      // 重置 hello 状态
      this.helloPromise = new Promise((resolve, reject) => {
        this.helloResolve = resolve
        this.helloReject = reject
      })

      // 创建 MQTT 客户端
      const protocol = useTls ? 'mqtts' : 'mqtt'
      const brokerUrl = `${protocol}://${host}:${port}`

      this.mqttClient = mqtt.connect(brokerUrl, {
        clientId: this.clientId,
        username: this.username,
        password: this.password,
        keepalive: this.keepAliveInterval / 1000,
        clean: true,
        reconnectPeriod: 0, // 禁用自动重连，我们自己管理
        connectTimeout: 10 * 1000,
        rejectUnauthorized: useTls, // TLS 时验证证书
      })

      // 设置事件监听器
      this.setupMqttListeners()

      // 等待连接成功
      await this.waitForConnection()

      // 订阅主题
      if (this.subscribeTopic && this.subscribeTopic !== 'null') {
        await this.subscribeMqtt(this.subscribeTopic)
      }

      // 启动连接监控
      this.startConnectionMonitor()

      // 发送 hello 消息
      const helloMessage = await this.sendHelloMessage()
      if (!helloMessage) {
        throw new Error('发送 hello 消息失败')
      }

      // 等待服务器 hello 响应
      await Promise.race([
        this.helloPromise,
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('等待服务器 hello 响应超时')), 10000),
        ),
      ])

      // 创建 UDP 套接字
      await this.setupUdpSocket()

      this.connected = true
      this.reconnectAttempts = 0

      console.log('[MqttProtocol] 已成功连接到 MQTT 服务器')

      // 通知连接状态变化
      if (this.onConnectionStateChangedCallback) {
        this.onConnectionStateChangedCallback(true, '连接成功')
      }

      return true
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('[MqttProtocol] 连接失败:', error)
      await this.cleanup()
      if (this.onNetworkErrorCallback) {
        this.onNetworkErrorCallback(`连接 MQTT 服务器失败: ${errorMessage}`)
      }
      return false
    }
  }

  /**
   * 加载 MQTT 配置
   */
  private async loadMqttConfig(): Promise<MqttConfig | null> {
    try {
      const config = getConfigManager()
      const mqttInfo = config.getMqttInfo()

      if (!mqttInfo) {
        console.error('[MqttProtocol] MQTT 配置未找到')
        if (this.onNetworkErrorCallback) {
          this.onNetworkErrorCallback('MQTT 配置未找到')
        }
        return null
      }

      const mqttConfig: MqttConfig = {
        endpoint: mqttInfo.endpoint || '',
        client_id: mqttInfo.client_id || '',
        username: mqttInfo.username || '',
        password: mqttInfo.password || '',
        publish_topic: mqttInfo.publish_topic || '',
        subscribe_topic: mqttInfo.subscribe_topic,
      }

      // 验证配置
      if (!mqttConfig.endpoint || !mqttConfig.username || !mqttConfig.password || !mqttConfig.publish_topic) {
        console.error('[MqttProtocol] MQTT 配置不完整')
        if (this.onNetworkErrorCallback) {
          this.onNetworkErrorCallback('MQTT 配置不完整')
        }
        return null
      }

      this.endpoint = mqttConfig.endpoint
      this.clientId = mqttConfig.client_id || `xiaozhi_${Date.now()}`
      this.username = mqttConfig.username
      this.password = mqttConfig.password
      this.publishTopic = mqttConfig.publish_topic
      this.subscribeTopic = mqttConfig.subscribe_topic === 'null' ? null : mqttConfig.subscribe_topic

      console.log(`[MqttProtocol] MQTT 配置已加载: ${this.endpoint}`)
      return mqttConfig
    }
    catch (error) {
      console.error('[MqttProtocol] 加载 MQTT 配置失败:', error)
      if (this.onNetworkErrorCallback) {
        this.onNetworkErrorCallback(`加载 MQTT 配置失败: ${error}`)
      }
      return null
    }
  }

  /**
   * 解析 endpoint
   */
  private parseEndpoint(endpoint: string): { host: string, port: number, useTls: boolean } {
    if (!endpoint) {
      throw new Error('endpoint 不能为空')
    }

    let host: string
    let port: number
    let useTls: boolean

    if (endpoint.includes(':')) {
      const parts = endpoint.split(':')
      host = parts[0]
      port = Number.parseInt(parts[1], 10)

      if (Number.isNaN(port) || port < 1 || port > 65535) {
        throw new Error(`无效的端口号: ${parts[1]}`)
      }

      useTls = port === 8883
    }
    else {
      host = endpoint
      port = 8883 // 默认端口
      useTls = true
    }

    return { host, port, useTls }
  }

  /**
   * 设置 MQTT 事件监听器
   */
  private setupMqttListeners(): void {
    if (!this.mqttClient) return

    this.mqttClient.on('connect', () => {
      console.log('[MqttProtocol] MQTT 已连接')
      this.lastActivityTime = Date.now()
    })

    this.mqttClient.on('message', (_topic: string, payload: Buffer) => {
      this.handleMqttMessage(payload.toString())
    })

    this.mqttClient.on('error', (error: Error) => {
      console.error('[MqttProtocol] MQTT 错误:', error)
      if (!this.isClosing) {
        this.handleConnectionLoss(`MQTT 错误: ${error.message}`)
      }
    })

    this.mqttClient.on('close', () => {
      console.log('[MqttProtocol] MQTT 连接已关闭')
      if (!this.isClosing) {
        this.handleConnectionLoss('MQTT 连接关闭')
      }
    })

    this.mqttClient.on('offline', () => {
      console.warn('[MqttProtocol] MQTT 离线')
      if (!this.isClosing) {
        this.handleConnectionLoss('MQTT 离线')
      }
    })
  }

  /**
   * 等待连接成功
   */
  private async waitForConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('MQTT 连接超时'))
      }, 10000)

      this.mqttClient!.once('connect', () => {
        clearTimeout(timeout)
        resolve()
      })

      this.mqttClient!.once('error', (error) => {
        clearTimeout(timeout)
        reject(error)
      })
    })
  }

  /**
   * 订阅 MQTT 主题
   */
  private async subscribeMqtt(topic: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.mqttClient!.subscribe(topic, { qos: 1 }, (error) => {
        if (error) {
          console.error(`[MqttProtocol] 订阅主题 ${topic} 失败:`, error)
          reject(error)
        }
        else {
          console.log(`[MqttProtocol] 成功订阅主题: ${topic}`)
          this.lastActivityTime = Date.now()
          resolve()
        }
      })
    })
  }

  /**
   * 发送 hello 消息
   */
  private async sendHelloMessage(): Promise<boolean> {
    const helloMessage: HelloMessage = {
      type: 'hello',
      version: 3,
      features: {
        mcp: true,
      },
      transport: 'udp',
      audio_params: {
        format: 'opus',
        sample_rate: 16000,
        channels: 1,
        frame_duration: 20,
      },
    }

    return await this.sendText(JSON.stringify(helloMessage))
  }

  /**
   * 处理 MQTT 消息
   */
  private handleMqttMessage(payload: string): void {
    try {
      this.lastActivityTime = Date.now()

      const data = JSON.parse(payload)
      const msgType = data.type

      if (msgType === 'hello') {
        this.handleServerHello(data)
      }
      else if (msgType === 'goodbye') {
        this.handleGoodbye(data)
      }
      else {
        // 其他 JSON 消息
        if (this.onIncomingJsonCallback) {
          this.onIncomingJsonCallback(data)
        }
      }
    }
    catch (error) {
      console.error('[MqttProtocol] 处理 MQTT 消息失败:', error)
    }
  }

  /**
   * 处理服务器 hello 消息
   */
  private handleServerHello(data: {
    transport?: string
    session_id?: string
    udp?: UdpConfig
  }): void {
    try {
      const transport = data.transport
      if (transport !== 'udp') {
        const error = new Error(`不支持的传输方式: ${transport}`)
        if (this.helloReject) {
          this.helloReject(error)
        }
        return
      }

      // 保存会话 ID
      if (data.session_id) {
        this.setSessionId(data.session_id)
      }

      // 保存 UDP 配置
      const udp = data.udp
      if (!udp) {
        const error = new Error('UDP 配置缺失')
        if (this.helloReject) {
          this.helloReject(error)
        }
        return
      }

      this.udpServer = udp.server
      this.udpPort = udp.port
      this.aesKey = Buffer.from(udp.key, 'hex')
      this.aesNonce = Buffer.from(udp.nonce, 'hex')
      this.localSequence = 0
      console.log(`[MqttProtocol] 收到服务器 hello，UDP: ${this.udpServer}:${this.udpPort}`)

      // 完成 hello promise
      if (this.helloResolve) {
        this.helloResolve()
      }

      // 通知音频通道已打开
      if (this.onAudioChannelOpenedCallback) {
        Promise.resolve(this.onAudioChannelOpenedCallback()).catch((error) => {
          console.error('[MqttProtocol] 音频通道打开回调出错:', error)
        })
      }
    }
    catch (error) {
      console.error('[MqttProtocol] 处理服务器 hello 失败:', error)
      if (this.helloReject) {
        this.helloReject(error instanceof Error ? error : new Error(String(error)))
      }
    }
  }

  /**
   * 处理 goodbye 消息
   */
  private async handleGoodbye(data: { session_id?: string }): Promise<void> {
    try {
      const sessionId = data.session_id
      if (!sessionId || sessionId === this.sessionId) {
        console.log('[MqttProtocol] 收到 goodbye 消息，关闭连接')
        await this.closeAudioChannel()
      }
    }
    catch (error) {
      console.error('[MqttProtocol] 处理 goodbye 消息失败:', error)
    }
  }

  /**
   * 设置 UDP 套接字
   */
  private async setupUdpSocket(): Promise<void> {
    try {
      // 关闭旧的 UDP 套接字
      if (this.udpSocket) {
        this.stopUdpReceiver()
      }

      // 创建新的 UDP 套接字
      this.udpSocket = dgram.createSocket('udp4')

      // 设置 UDP 事件监听
      this.udpSocket.on('message', (msg: Buffer, rinfo: dgram.RemoteInfo) => {
        this.handleUdpMessage(msg, rinfo)
      })

      this.udpSocket.on('error', (error: Error) => {
        console.error('[MqttProtocol] UDP 错误:', error)
      })

      this.udpRunning = true
      console.log('[MqttProtocol] UDP 套接字已创建')
    }
    catch (error) {
      console.error('[MqttProtocol] 创建 UDP 套接字失败:', error)
      throw error
    }
  }

  /**
   * 处理 UDP 消息
   */
  private handleUdpMessage(msg: Buffer, _rinfo: dgram.RemoteInfo): void {
    try {
      // 验证数据包大小
      if (msg.length < 16) {
        console.error(`[MqttProtocol] 无效的音频数据包大小: ${msg.length}`)
        return
      }

      // 分离 nonce 和加密数据
      const receivedNonce = msg.subarray(0, 16)
      const encryptedAudio = msg.subarray(16)

      // 解密
      if (!this.aesKey) {
        console.error('[MqttProtocol] AES 密钥未设置')
        return
      }

      const decrypted = this.aesCtrDecrypt(this.aesKey, receivedNonce, encryptedAudio)

      // 传递给音频回调
      if (this.onIncomingAudioCallback) {
        this.onIncomingAudioCallback(decrypted)
      }
    }
    catch (error) {
      console.error('[MqttProtocol] 处理 UDP 消息失败:', error)
    }
  }

  /**
   * AES-CTR 加密
   */
  private aesCtrEncrypt(key: Buffer, nonce: Buffer, plaintext: Buffer): Buffer {
    const cipher = crypto.createCipheriv('aes-256-ctr', key, nonce)
    return Buffer.concat([cipher.update(plaintext), cipher.final()])
  }

  /**
   * AES-CTR 解密
   */
  private aesCtrDecrypt(key: Buffer, nonce: Buffer, ciphertext: Buffer): Buffer {
    const decipher = crypto.createDecipheriv('aes-256-ctr', key, nonce)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()])
  }

  /**
   * 启动连接监控
   */
  private startConnectionMonitor(): void {
    this.stopConnectionMonitor()

    this.connectionMonitorTimer = setInterval(() => {
      if (!this.connected || this.isClosing) {
        return
      }

      // 检查 MQTT 连接状态
      if (!this.mqttClient || !this.mqttClient.connected) {
        console.warn('[MqttProtocol] 检测到 MQTT 连接断开')
        this.handleConnectionLoss('MQTT 连接检测失败')
        return
      }

      // 检查最后活动时间
      const timeSinceActivity = Date.now() - this.lastActivityTime
      if (timeSinceActivity > this.connectionTimeout) {
        console.warn(`[MqttProtocol] 连接超时，最后活动: ${timeSinceActivity}ms 前`)
        this.handleConnectionLoss('连接超时')
      }
    }, 30000) // 每 30 秒检查一次
  }

  /**
   * 停止连接监控
   */
  private stopConnectionMonitor(): void {
    if (this.connectionMonitorTimer) {
      clearInterval(this.connectionMonitorTimer)
      this.connectionMonitorTimer = null
    }
  }

  /**
   * 处理连接丢失
   */
  private async handleConnectionLoss(reason: string): Promise<void> {
    // 防止重复调用
    if (this.isHandlingConnectionLoss) {
      console.log(`[MqttProtocol] 已在处理连接丢失，忽略: ${reason}`)
      return
    }
    this.isHandlingConnectionLoss = true

    console.warn(`[MqttProtocol] 连接丢失: ${reason}`)

    const wasConnected = this.connected
    this.connected = false

    // 通知连接状态变化
    if (this.onConnectionStateChangedCallback && wasConnected) {
      try {
        this.onConnectionStateChangedCallback(false, reason)
      }
      catch (error) {
        console.error('[MqttProtocol] 调用连接状态变化回调失败:', error)
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
        console.error('[MqttProtocol] 调用音频通道关闭回调失败:', error)
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
        console.error('[MqttProtocol] 调用重连回调失败:', error)
      }
    }

    console.log(`[MqttProtocol] 尝试自动重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})`)

    // 指数退避，最大 30 秒
    const delay = Math.min(this.reconnectAttempts * 2000, 30000)
    await new Promise(resolve => setTimeout(resolve, delay))

    // 如果在等待期间被取消，直接返回
    if (this.isClosing) {
      console.log('[MqttProtocol] 重连被取消')
      return
    }

    try {
      const success = await this.connect()
      if (success) {
        console.log('[MqttProtocol] 自动重连成功')
        if (this.onConnectionStateChangedCallback) {
          this.onConnectionStateChangedCallback(true, '重连成功')
        }
      }
      else {
        console.warn(`[MqttProtocol] 自动重连失败 (${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          if (this.onNetworkErrorCallback) {
            this.onNetworkErrorCallback(`重连失败，已达到最大重连次数: ${originalReason}`)
          }
        }
      }
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('[MqttProtocol] 重连过程中出错:', error)
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        if (this.onNetworkErrorCallback) {
          this.onNetworkErrorCallback(`重连异常: ${errorMessage}`)
        }
      }
    }
  }

  /**
   * 停止 UDP 接收器
   */
  private stopUdpReceiver(): void {
    this.udpRunning = false

    if (this.udpSocket) {
      try {
        this.udpSocket.close()
      }
      catch (error) {
        console.error('[MqttProtocol] 关闭 UDP 套接字失败:', error)
      }
      this.udpSocket = null
    }
  }

  /**
   * 清理资源
   */
  private async cleanup(): Promise<void> {
    this.connected = false
    this.isHandlingConnectionLoss = false

    // 停止连接监控
    this.stopConnectionMonitor()

    // 停止 UDP
    this.stopUdpReceiver()

    // 关闭 MQTT 客户端
    if (this.mqttClient) {
      try {
        this.mqttClient.removeAllListeners()
        await new Promise<void>((resolve) => {
          this.mqttClient!.end(false, {}, () => {
            resolve()
          })
        })
      }
      catch (error) {
        console.error('[MqttProtocol] 关闭 MQTT 客户端失败:', error)
      }
      this.mqttClient = null
    }

    // 重置序列号和 hello 状态
    this.localSequence = 0
    this.helloResolve = null
    this.helloReject = null
    this.helloPromise = null
  }

  /**
   * 发送文本消息
   */
  async sendText(message: string): Promise<boolean> {
    if (!this.mqttClient || this.isClosing) {
      console.warn('[MqttProtocol] MQTT 客户端未连接或正在关闭')
      return false
    }

    if (!this.mqttClient.connected) {
      console.warn('[MqttProtocol] MQTT 客户端未连接')
      return false
    }

    return new Promise((resolve) => {
      this.mqttClient!.publish(this.publishTopic, message, { qos: 1 }, (error) => {
        if (error) {
          console.error('[MqttProtocol] 发送 MQTT 消息失败:', error)
          this.handleConnectionLoss(`发送消息失败: ${error.message}`)
          resolve(false)
        }
        else {
          this.lastActivityTime = Date.now()
          resolve(true)
        }
      })
    })
  }

  /**
   * 发送音频数据
   */
  async sendAudio(data: Buffer): Promise<boolean> {
    if (!this.udpSocket || !this.udpServer || !this.udpPort || !this.aesKey || !this.aesNonce) {
      console.error('[MqttProtocol] UDP 通道未初始化')
      return false
    }

    try {
      // 生成新的 nonce
      this.localSequence = (this.localSequence + 1) & 0xFFFFFFFF

      const dataLength = Buffer.allocUnsafe(2)
      dataLength.writeUInt16BE(data.length, 0)

      const sequenceBuffer = Buffer.allocUnsafe(8)
      sequenceBuffer.writeBigUInt64BE(BigInt(this.localSequence), 0)

      const newNonce = Buffer.concat([
        this.aesNonce.subarray(0, 4), // 固定前缀
        dataLength, // 数据长度
        this.aesNonce.subarray(8, 24), // 原始 nonce
        sequenceBuffer, // 序列号
      ])

      // 加密
      const encrypted = this.aesCtrEncrypt(this.aesKey, newNonce, data)

      // 拼接 nonce 和密文
      const packet = Buffer.concat([newNonce, encrypted])

      // 发送
      return new Promise((resolve, reject) => {
        this.udpSocket!.send(packet, this.udpPort, this.udpServer, (error) => {
          if (error) {
            console.error('[MqttProtocol] 发送 UDP 数据失败:', error)
            reject(error)
          }
          else {
            resolve(true)
          }
        })
      })
    }
    catch (error) {
      console.error('[MqttProtocol] 发送音频数据失败:', error)
      if (this.onNetworkErrorCallback) {
        this.onNetworkErrorCallback(`发送音频数据失败: ${error}`)
      }
      return false
    }
  }

  /**
   * 检查音频通道是否打开
   */
  isAudioChannelOpened(): boolean {
    if (!this.mqttClient || !this.connected || this.isClosing) {
      return false
    }

    return this.mqttClient.connected && this.udpRunning
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
      // 发送 goodbye 消息
      if (this.sessionId) {
        const goodbye = {
          type: 'goodbye',
          session_id: this.sessionId,
        }
        await this.sendText(JSON.stringify(goodbye))
      }

      await this.cleanup()

      if (this.onAudioChannelClosedCallback) {
        await Promise.resolve(this.onAudioChannelClosedCallback())
      }
    }
    catch (error) {
      console.error('[MqttProtocol] 关闭音频通道失败:', error)
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
      console.log(`[MqttProtocol] 启用自动重连，最大尝试次数: ${maxAttempts}`)
    }
    else {
      this.maxReconnectAttempts = 0
      console.log('[MqttProtocol] 禁用自动重连')
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
