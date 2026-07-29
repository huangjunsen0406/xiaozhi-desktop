import type { JsonMessage } from '../types/protocol'
/**
 * MQTT Protocol Implementation
 * 基于 Python 和 C++ 版本实现
 * 使用 MQTT + UDP 双通道架构，音频通过 UDP 加密传输
 */
import type { ConnectionInfo } from './Protocol'
import { Buffer } from 'node:buffer'
import crypto from 'node:crypto'
import dgram from 'node:dgram'
import * as mqtt from 'mqtt'
import { getAudioConfig } from '../ipc/audioIpc'
import { getConfigManager } from '../services/configManagerDB'
import { getLogger } from '../utils/logger'
import { Protocol } from './Protocol'

const logger = getLogger('MQTT')

interface UdpConfig {
  server: string
  port: number
  key: string
  nonce: string
}

export class MqttProtocol extends Protocol {
  // MQTT 相关
  private mqttClient: mqtt.MqttClient | null = null
  private endpoint: string = ''
  private clientId: string = ''
  private username: string = ''
  private password: string = ''
  private publishTopic: string = ''
  private subscribeTopic: string | null = null

  // UDP 相关
  private udpSocket: dgram.Socket | null = null
  private udpServer: string = ''
  private udpPort: number = 0
  private aesKey: Buffer | null = null
  private aesNonce: string = ''
  private localSequence: number = 0

  // 状态管理
  private connected: boolean = false
  private isClosing: boolean = false
  private serverHelloReceived: boolean = false
  private serverHelloResolve: (() => void) | null = null

  // 连接监控
  private reconnectAttempts: number = 0
  private maxReconnectAttempts: number = 0
  private autoReconnectEnabled: boolean = false
  private lastActivityTime: number | null = null
  private connectionMonitorTimer: NodeJS.Timeout | null = null
  private readonly keepAliveInterval: number = 60
  private readonly connectionTimeout: number = 120

  constructor() {
    super()
    logger.info('初始化')
  }

  /**
   * 解析 endpoint，提取主机和端口
   */
  private parseEndpoint(endpoint: string): { host: string, port: number, useTls: boolean } {
    if (!endpoint) {
      throw new Error('endpoint 不能为空')
    }

    let host: string
    let port: number

    if (endpoint.includes(':')) {
      const parts = endpoint.split(':')
      host = parts[0]
      port = Number.parseInt(parts[1], 10)

      if (Number.isNaN(port) || port < 1 || port > 65535) {
        throw new Error(`无效的端口号: ${parts[1]}`)
      }
    }
    else {
      host = endpoint
      port = 8883 // 默认使用 TLS 端口
    }

    const useTls = port === 8883

    return { host, port, useTls }
  }

  /**
   * 从配置管理器获取 MQTT 信息
   */
  private loadMqttConfig(): boolean {
    const configManager = getConfigManager()
    const mqttInfo = configManager.getMqttInfo()

    if (!mqttInfo) {
      logger.error('MQTT 配置未设置')
      return false
    }

    this.endpoint = mqttInfo.endpoint || ''
    this.clientId = mqttInfo.client_id || ''
    this.username = mqttInfo.username || ''
    this.password = mqttInfo.password || ''
    this.publishTopic = mqttInfo.publish_topic || ''
    this.subscribeTopic = mqttInfo.subscribe_topic === 'null' ? null : mqttInfo.subscribe_topic

    logger.info('MQTT 配置:', {
      endpoint: this.endpoint,
      client_id: this.clientId,
      publish_topic: this.publishTopic,
      subscribe_topic: this.subscribeTopic,
    })

    return true
  }

  /**
   * 重新加载配置（用于配置更新后刷新）
   */
  reloadConfig(): boolean {
    logger.info('重新加载 MQTT 配置')
    const success = this.loadMqttConfig()
    if (success) {
      logger.info('MQTT 配置已更新')
    }
    return success
  }

  /**
   * 连接到 MQTT 服务器
   */
  async connect(): Promise<boolean> {
    if (this.isClosing) {
      logger.warn('连接正在关闭中，取消新的连接尝试')
      return false
    }

    try {
      // 加载配置
      if (!this.loadMqttConfig()) {
        this.onNetworkErrorCallback?.('MQTT 配置未设置')
        return false
      }

      // 验证配置
      if (!this.endpoint || !this.username || !this.password || !this.publishTopic) {
        const error = 'MQTT 配置不完整'
        logger.error(`${error}`)
        this.onNetworkErrorCallback?.(error)
        return false
      }

      // 如果已有客户端，先断开
      if (this.mqttClient) {
        await this.mqttClient.endAsync(true)
        this.mqttClient = null
      }

      // 解析 endpoint
      const { host, port, useTls } = this.parseEndpoint(this.endpoint)
      logger.info(`解析 endpoint: ${this.endpoint} -> 主机: ${host}, 端口: ${port}, TLS: ${useTls}`)

      // 创建 MQTT 客户端
      const connectUrl = useTls ? `mqtts://${host}:${port}` : `mqtt://${host}:${port}`

      this.mqttClient = mqtt.connect(connectUrl, {
        clientId: this.clientId,
        username: this.username,
        password: this.password,
        keepalive: this.keepAliveInterval,
        clean: true,
        reconnectPeriod: 0,
        connectTimeout: 10000,
        rejectUnauthorized: useTls,
      })

      // 设置事件处理器
      this.setupMqttHandlers()

      // 等待连接建立
      await this.waitForConnection()

      // 订阅主题
      if (this.subscribeTopic) {
        await this.mqttClient.subscribeAsync(this.subscribeTopic, { qos: 1 })
        logger.info(`已订阅主题: ${this.subscribeTopic}`)
      }

      // 启动连接监控
      this.startConnectionMonitor()

      // 发送 hello 消息
      const helloMessage = this.createHelloMessage()
      const sent = await this.sendText(JSON.stringify(helloMessage))
      if (!sent) {
        logger.error('发送 hello 消息失败')
        return false
      }

      // 等待服务器 hello 响应
      try {
        await this.waitForServerHello()
      }
      catch (error) {
        logger.error('等待服务器 hello 超时:', error)
        this.onNetworkErrorCallback?.('等待服务器响应超时')
        return false
      }

      // 创建 UDP socket
      try {
        await this.createUdpSocket()
        this.connected = true
        this.reconnectAttempts = 0

        this.onConnectionStateChangedCallback?.(true, '连接成功')
        return true
      }
      catch (error) {
        logger.error('创建 UDP socket 失败:', error)
        this.onNetworkErrorCallback?.(`创建 UDP 连接失败: ${error}`)
        return false
      }
    }
    catch (error) {
      logger.error('连接失败:', error)
      this.onNetworkErrorCallback?.(`连接 MQTT 服务器失败: ${error}`)
      return false
    }
  }

  private setupMqttHandlers(): void {
    if (!this.mqttClient)
      return

    this.mqttClient.on('connect', () => {
      logger.info('MQTT 已连接')
      this.lastActivityTime = Date.now()
    })

    this.mqttClient.on('message', (_topic: string, payload: Buffer) => {
      this.lastActivityTime = Date.now()
      this.handleMqttMessage(payload.toString('utf-8'))
    })

    this.mqttClient.on('disconnect', () => {
      logger.info('MQTT 连接断开')
      this.handleDisconnect()
    })

    this.mqttClient.on('offline', () => {
      logger.warn('MQTT 离线')
      this.handleDisconnect()
    })

    this.mqttClient.on('error', (error) => {
      logger.error('MQTT 错误:', error)
    })
  }

  private waitForConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('连接超时'))
      }, 10000)

      if (!this.mqttClient) {
        clearTimeout(timeout)
        reject(new Error('MQTT 客户端未初始化'))
        return
      }

      this.mqttClient.once('connect', () => {
        clearTimeout(timeout)
        resolve()
      })

      this.mqttClient.once('error', (error) => {
        clearTimeout(timeout)
        reject(error)
      })
    })
  }

  private waitForServerHello(): Promise<void> {
    this.serverHelloReceived = false
    return new Promise((resolve, reject) => {
      this.serverHelloResolve = resolve

      setTimeout(() => {
        if (!this.serverHelloReceived) {
          reject(new Error('等待服务器 hello 超时'))
        }
      }, 10000)
    })
  }

  private createHelloMessage() {
    const audioConfig = getAudioConfig()
    const aecEnabled = audioConfig.enableEchoCancellation !== false

    return {
      type: 'hello',
      version: 3,
      features: {
        mcp: true,
        aec: aecEnabled,
      },
      transport: 'udp',
      audio_params: {
        format: 'opus',
        sample_rate: audioConfig.inputSampleRate,
        channels: audioConfig.channels,
        frame_duration: audioConfig.frameDuration,
      },
    }
  }

  private handleMqttMessage(payload: string): void {
    try {
      const data = JSON.parse(payload) as JsonMessage
      const msgType = data.type

      if (msgType === 'goodbye') {
        const sessionId = (data as any).session_id
        if (!sessionId || sessionId === this.sessionId) {
          this.handleGoodbye().catch((error) => {
            logger.error('处理 goodbye 失败:', error)
          })
        }
        return
      }

      if (msgType === 'hello') {
        this.parseServerHello(data)
        return
      }

      this.onIncomingJsonCallback?.(data)
    }
    catch (error) {
      logger.error('解析 MQTT 消息失败:', error, payload)
    }
  }

  private parseServerHello(data: any): void {
    logger.info('收到服务器 hello 响应', data)

    const transport = data.transport
    if (transport !== 'udp') {
      logger.error(`不支持的传输方式: ${transport}`)
      return
    }

    this.sessionId = data.session_id || ''

    const udp: UdpConfig = data.udp
    if (!udp) {
      logger.error('UDP 配置缺失')
      return
    }

    this.udpServer = udp.server
    this.udpPort = udp.port
    this.aesNonce = udp.nonce
    this.aesKey = Buffer.from(udp.key, 'hex')
    this.localSequence = 0

    logger.info(`UDP 服务器: ${this.udpServer}:${this.udpPort}`)

    this.serverHelloReceived = true
    this.serverHelloResolve?.()

    if (this.onAudioChannelOpenedCallback) {
      Promise.resolve(this.onAudioChannelOpenedCallback()).catch((error) => {
        logger.error('音频通道打开回调出错:', error)
      })
    }
  }

  private async createUdpSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.udpSocket) {
        try {
          this.udpSocket.close()
        }
        catch (e) {
          logger.error('关闭旧 socket 失败:', e)
        }
      }

      this.udpSocket = dgram.createSocket('udp4')

      this.udpSocket.on('message', (data: Buffer) => {
        this.handleUdpMessage(data).catch((error) => {
          logger.error('处理 UDP 消息失败:', error)
        })
      })

      this.udpSocket.on('error', (error) => {
        logger.error('UDP socket 错误:', error)
        // 不要在 error 时 reject，因为可能是在运行中发生的
        if (!this.connected) {
          reject(error)
        }
      })

      this.udpSocket.on('listening', () => {
        try {
          const address = this.udpSocket!.address()
          logger.info(`🎧 UDP socket 已启动 (隐式绑定)`)
          logger.info(`📍 本地地址: ${address.address}:${address.port}`)
        }
        catch {
          // 忽略错误
        }
      })

      // 关键修改：不显式 bind，而是发送一个空包来触发隐式绑定和 NAT 打洞
      // 这完全模拟了 Python 的行为（Python 是直接 sendto）
      const dummyPacket = Buffer.from([0])
      this.udpSocket.send(dummyPacket, this.udpPort, this.udpServer, (err) => {
        if (err) {
          logger.error('发送打洞包失败:', err)
          reject(err)
        }
        else {
          logger.info(`🚀 已发送打洞包到 ${this.udpServer}:${this.udpPort}`)
          resolve()
        }
      })
    })
  }

  private async handleUdpMessage(data: Buffer): Promise<void> {
    try {
      if (data.length < 16) {
        return
      }

      const receivedNonce = data.subarray(0, 16)
      const encryptedAudio = data.subarray(16)

      const decrypted = this.aesCtrDecrypt(this.aesKey!, receivedNonce, encryptedAudio)

      if (this.onIncomingAudioCallback) {
        this.onIncomingAudioCallback(decrypted)
      }
    }
    catch (error) {
      logger.error('处理音频数据包错误:', error)
    }
  }

  private aesCtrEncrypt(key: Buffer, nonce: Buffer, plaintext: Buffer): Buffer {
    const cipher = crypto.createCipheriv('aes-128-ctr', key, nonce)
    return Buffer.concat([cipher.update(plaintext), cipher.final()])
  }

  private aesCtrDecrypt(key: Buffer, nonce: Buffer, ciphertext: Buffer): Buffer {
    const decipher = crypto.createDecipheriv('aes-128-ctr', key, nonce)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()])
  }

  private generateNonce(dataLength: number): Buffer {
    const baseNonce = Buffer.from(this.aesNonce, 'hex')
    const nonce = Buffer.alloc(16)

    // Python: self.aes_nonce[:4] -> 前4个字符 -> 前2个字节
    baseNonce.copy(nonce, 0, 0, 2)

    // Python: format(len(audio_data), "04x") -> 2个字节
    nonce.writeUInt16BE(dataLength, 2)

    // Python: self.aes_nonce[8:24] -> 第8-24个字符 -> 第4-12个字节 (8个字节)
    baseNonce.copy(nonce, 4, 4, 12)

    // Python: format(self.local_sequence, "08x") -> 4个字节
    nonce.writeUInt32BE(this.localSequence, 12)

    return nonce
  }

  async sendText(message: string): Promise<boolean> {
    if (!this.mqttClient || !this.mqttClient.connected) {
      logger.error('MQTT 客户端未连接')
      return false
    }

    try {
      await this.mqttClient.publishAsync(this.publishTopic, message, { qos: 0 })
      return true
    }
    catch (error) {
      logger.error('发送 MQTT 消息失败:', error)
      this.onNetworkErrorCallback?.(`发送消息失败: ${error}`)
      return false
    }
  }

  async sendAudio(audioData: Buffer): Promise<boolean> {
    if (!this.udpSocket || !this.udpServer || !this.udpPort || !this.aesKey) {
      logger.error('UDP 通道未初始化')
      return false
    }

    try {
      this.localSequence = (this.localSequence + 1) & 0xFFFFFFFF
      const nonce = this.generateNonce(audioData.length)
      const encrypted = this.aesCtrEncrypt(this.aesKey, nonce, audioData)
      const packet = Buffer.concat([nonce, encrypted])

      await new Promise<void>((resolve, reject) => {
        this.udpSocket!.send(packet, this.udpPort, this.udpServer, (error) => {
          if (error)
            reject(error)
          else
            resolve()
        })
      })

      return true
    }
    catch (error) {
      this.onNetworkErrorCallback?.(`发送音频失败: ${error}`)
      return false
    }
  }

  isAudioChannelOpened(): boolean {
    return this.connected
      && !this.isClosing
      && this.mqttClient?.connected === true
      && this.udpSocket !== null
  }

  async openAudioChannel(): Promise<boolean> {
    if (this.isAudioChannelOpened()) {
      return true
    }

    const success = await this.connect()
    if (success && this.onAudioChannelOpenedCallback) {
      await this.onAudioChannelOpenedCallback()
    }

    return success
  }

  async closeAudioChannel(): Promise<void> {
    this.isClosing = true

    try {
      if (this.sessionId) {
        const goodbyeMsg = {
          type: 'goodbye',
          session_id: this.sessionId,
        }
        await this.sendText(JSON.stringify(goodbyeMsg))
      }

      await this.handleGoodbye()
    }
    catch (error) {
      logger.error('关闭音频通道时出错:', error)
      if (this.onAudioChannelClosedCallback) {
        await this.onAudioChannelClosedCallback()
      }
    }
    finally {
      this.isClosing = false
    }
  }

  private async handleGoodbye(): Promise<void> {
    try {
      if (this.udpSocket) {
        this.udpSocket.close()
        this.udpSocket = null
      }

      if (this.connectionMonitorTimer) {
        clearInterval(this.connectionMonitorTimer)
        this.connectionMonitorTimer = null
      }

      if (this.mqttClient) {
        await this.mqttClient.endAsync(true)
        this.mqttClient = null
      }

      this.connected = false
      this.sessionId = ''
      this.localSequence = 0
      this.udpServer = ''
      this.udpPort = 0
      this.aesKey = null
      this.aesNonce = ''

      if (this.onAudioChannelClosedCallback) {
        await this.onAudioChannelClosedCallback()
      }
    }
    catch (error) {
      logger.error('处理 goodbye 失败:', error)
    }
  }

  private handleDisconnect(): void {
    const wasConnected = this.connected
    this.connected = false

    if (wasConnected && this.onConnectionStateChangedCallback) {
      this.onConnectionStateChangedCallback(false, 'MQTT 断开')
    }

    if (this.udpSocket) {
      this.udpSocket.close()
      this.udpSocket = null
    }

    if (!this.isClosing && this.autoReconnectEnabled && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.attemptReconnect('MQTT 断开').catch((error) => {
        logger.error('重连失败:', error)
      })
    }
    else {
      if (this.onAudioChannelClosedCallback) {
        this.onAudioChannelClosedCallback()
      }

      if (this.onNetworkErrorCallback) {
        let errorMsg = 'MQTT 连接断开'
        if (this.autoReconnectEnabled && this.reconnectAttempts >= this.maxReconnectAttempts) {
          errorMsg += ' (重连失败)'
        }
        this.onNetworkErrorCallback(errorMsg)
      }
    }
  }

  private startConnectionMonitor(): void {
    if (this.connectionMonitorTimer) {
      clearInterval(this.connectionMonitorTimer)
    }

    this.connectionMonitorTimer = setInterval(() => {
      if (!this.mqttClient?.connected) {
        logger.warn('检测到 MQTT 连接已断开')
        this.handleConnectionLoss('MQTT 连接检测失败')
        return
      }

      if (this.lastActivityTime) {
        const elapsed = Date.now() - this.lastActivityTime
        if (elapsed > this.connectionTimeout * 1000) {
          logger.warn(`连接超时，最后活动: ${elapsed / 1000}秒前`)
          this.handleConnectionLoss('连接超时')
        }
      }
    }, 30000)
  }

  private async handleConnectionLoss(reason: string): Promise<void> {
    logger.warn(`连接丢失: ${reason}`)

    const wasConnected = this.connected
    this.connected = false

    if (wasConnected && this.onConnectionStateChangedCallback) {
      this.onConnectionStateChangedCallback(false, reason)
    }

    await this.cleanupConnection()

    if (this.onAudioChannelClosedCallback) {
      await this.onAudioChannelClosedCallback()
    }

    if (!this.isClosing && this.autoReconnectEnabled && this.reconnectAttempts < this.maxReconnectAttempts) {
      await this.attemptReconnect(reason)
    }
    else {
      if (this.onNetworkErrorCallback) {
        let errorMsg = `连接丢失: ${reason}`
        if (this.autoReconnectEnabled && this.reconnectAttempts >= this.maxReconnectAttempts) {
          errorMsg += ' (重连失败)'
        }
        this.onNetworkErrorCallback(errorMsg)
      }
    }
  }

  private async attemptReconnect(originalReason: string): Promise<void> {
    this.reconnectAttempts++

    if (this.onReconnectingCallback) {
      this.onReconnectingCallback(this.reconnectAttempts, this.maxReconnectAttempts)
    }

    logger.info(`尝试自动重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})`)

    const delay = Math.min(this.reconnectAttempts * 2000, 30000)
    await new Promise(resolve => setTimeout(resolve, delay))

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
        logger.warn(`自动重连失败 (${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          if (this.onNetworkErrorCallback) {
            this.onNetworkErrorCallback(`重连失败，已达到最大重连次数: ${originalReason}`)
          }
        }
      }
    }
    catch (error) {
      logger.error('重连过程中出错:', error)
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        if (this.onNetworkErrorCallback) {
          this.onNetworkErrorCallback(`重连异常: ${error}`)
        }
      }
    }
  }

  private async cleanupConnection(): Promise<void> {
    this.connected = false

    if (this.connectionMonitorTimer) {
      clearInterval(this.connectionMonitorTimer)
      this.connectionMonitorTimer = null
    }

    if (this.udpSocket) {
      this.udpSocket.close()
      this.udpSocket = null
    }

    if (this.mqttClient) {
      try {
        await this.mqttClient.endAsync(true)
      }
      catch (error) {
        logger.error('断开 MQTT 连接失败:', error)
      }
    }

    this.lastActivityTime = null
  }

  enableAutoReconnect(enabled: boolean, maxAttempts: number = 5): void {
    this.autoReconnectEnabled = enabled
    if (enabled) {
      this.maxReconnectAttempts = maxAttempts
      logger.info(`启用自动重连，最大尝试次数: ${maxAttempts}`)
    }
    else {
      this.maxReconnectAttempts = 0
      logger.info('禁用自动重连')
    }
  }

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
