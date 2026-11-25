/**
 * MQTT Protocol Implementation
 * 使用 MQTT + UDP 双通道架构，控制消息走 MQTT，音频通过 UDP AES-128-CTR 加密传输
 */
import type { HelloMessage } from './Protocol'
import { Buffer } from 'node:buffer'
import crypto from 'node:crypto'
import dgram from 'node:dgram'
import { parseServerMessage } from '@shared/types'
import * as mqtt from 'mqtt'
import { getAudioRuntime } from '../audio/AudioRuntime'
import { getConfigManager } from '../services/configManagerDB'
import { getLogger } from '../utils/logger'
import { parseMqttServerHello } from './mqttServerHello'
import { Protocol } from './Protocol'

const logger = getLogger('MQTT')

export class MqttProtocol extends Protocol {
  private mqttClient: mqtt.MqttClient | null = null
  private endpoint: string = ''
  private clientId: string = ''
  private username: string = ''
  private password: string = ''
  private publishTopic: string = ''
  private subscribeTopic: string | null = null

  private udpSocket: dgram.Socket | null = null
  private udpServer: string = ''
  private udpPort: number = 0
  private aesKey: Buffer | null = null
  private aesNonce: string = ''
  private localSequence: number = 0

  private connected: boolean = false
  private isClosing: boolean = false
  private serverHelloResolve: (() => void) | null = null
  private serverHelloTimer: NodeJS.Timeout | null = null
  private lastActivityTime: number | null = null
  private connectionMonitorTimer: NodeJS.Timeout | null = null
  private readonly keepAliveInterval: number = 60
  private readonly connectionTimeout: number = 120

  constructor() {
    super()
    logger.info('初始化')
  }

  private parseEndpoint(endpoint: string): { host: string, port: number, useTls: boolean } {
    if (!endpoint)
      throw new Error('endpoint 不能为空')

    let host = endpoint
    let port = 8883
    if (endpoint.includes(':')) {
      const [h, p] = endpoint.split(':')
      host = h
      port = Number.parseInt(p, 10)
      if (Number.isNaN(port) || port < 1 || port > 65535)
        throw new Error(`无效的端口号: ${p}`)
    }

    return { host, port, useTls: port === 8883 }
  }

  private loadMqttConfig(): boolean {
    const mqttInfo = getConfigManager().getMqttInfo()
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

  reloadConfig(): boolean {
    logger.info('重新加载 MQTT 配置')
    const ok = this.loadMqttConfig()
    if (ok)
      logger.info('MQTT 配置已更新')
    return ok
  }

  async connect(): Promise<boolean> {
    if (this.isClosing) {
      logger.warn('连接正在关闭中，取消新的连接尝试')
      return false
    }

    try {
      if (!this.loadMqttConfig()) {
        this.onNetworkErrorCallback?.('MQTT 配置未设置')
        return false
      }

      if (!this.endpoint || !this.username || !this.password || !this.publishTopic) {
        const error = 'MQTT 配置不完整'
        logger.error(error)
        this.onNetworkErrorCallback?.(error)
        return false
      }

      if (this.mqttClient) {
        await this.cleanupConnection()
      }

      const { host, port, useTls } = this.parseEndpoint(this.endpoint)
      logger.info(`解析 endpoint: ${this.endpoint} -> 主机: ${host}, 端口: ${port}, TLS: ${useTls}`)

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

      this.setupMqttHandlers()
      await this.waitForConnection()

      if (this.subscribeTopic) {
        await this.mqttClient.subscribeAsync(this.subscribeTopic, { qos: 1 })
        logger.info(`已订阅主题: ${this.subscribeTopic}`)
      }

      this.startConnectionMonitor()

      // 先注册 hello 等待再发布，避免服务端快速响应（或本地测试）早于 publishAsync resolve 到达
      const serverHelloPromise = this.waitForServerHello()
      const sent = await this.sendRawText(JSON.stringify(this.createHelloMessage()))
      if (!sent) {
        logger.error('发送 hello 消息失败')
        await this.cleanupConnection()
        return false
      }

      await serverHelloPromise
      await this.createUdpSocket()

      this.connected = true
      return true
    }
    catch (error) {
      logger.error('连接失败:', error)
      await this.cleanupConnection()
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
      void this.handleUnexpectedDisconnect('MQTT 连接断开')
    })

    this.mqttClient.on('offline', () => {
      logger.warn('MQTT 离线')
      void this.handleUnexpectedDisconnect('MQTT 连接断开')
    })

    this.mqttClient.on('error', (error) => {
      logger.error('MQTT 错误:', error)
    })
  }

  private waitForConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.mqttClient) {
        reject(new Error('MQTT 客户端未初始化'))
        return
      }

      const client = this.mqttClient
      let settled = false
      let timer: ReturnType<typeof setTimeout>

      const onConnect = (): void => {
        if (settled)
          return
        settled = true
        clearTimeout(timer)
        resolve()
      }
      const onError = (error: Error): void => {
        if (settled)
          return
        settled = true
        clearTimeout(timer)
        reject(error)
      }

      timer = setTimeout(() => {
        if (settled)
          return
        settled = true
        client.off('connect', onConnect)
        client.off('error', onError)
        reject(new Error('连接超时'))
      }, 10000)

      client.once('connect', onConnect)
      client.once('error', onError)
    })
  }

  private waitForServerHello(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.serverHelloTimer)
        clearTimeout(this.serverHelloTimer)

      this.serverHelloTimer = setTimeout(() => {
        this.serverHelloTimer = null
        this.serverHelloResolve = null
        reject(new Error('等待服务器 hello 超时'))
      }, 10000)

      this.serverHelloResolve = () => {
        if (this.serverHelloTimer) {
          clearTimeout(this.serverHelloTimer)
          this.serverHelloTimer = null
        }
        this.serverHelloResolve = null
        resolve()
      }
    })
  }

  private createHelloMessage(): HelloMessage {
    return {
      type: 'hello',
      version: 3,
      features: { mcp: true },
      transport: 'udp',
      audio_params: getAudioRuntime().getUplinkParams(),
    }
  }

  private handleMqttMessage(payload: string): void {
    try {
      const parsed: unknown = JSON.parse(payload)
      const data = parseServerMessage(parsed)
      if (!data) {
        logger.error('MQTT 消息形态无效', parsed)
        return
      }

      if (data.type === 'goodbye') {
        if (!data.session_id || data.session_id === this.sessionId) {
          void this.handleGoodbye()
        }
        return
      }

      if (data.type === 'hello') {
        this.parseServerHello(parsed)
        return
      }

      this.onIncomingJsonCallback?.(data)
    }
    catch (error) {
      logger.error('解析 MQTT 消息失败:', error, payload)
    }
  }

  private parseServerHello(data: unknown): void {
    logger.info('收到服务器 hello 响应', data)

    const hello = parseMqttServerHello(data)
    if (!hello) {
      const transport = typeof data === 'object' && data !== null && 'transport' in data
        ? (data as { transport?: unknown }).transport
        : undefined
      logger.error(
        transport !== undefined && transport !== 'udp'
          ? `不支持的传输方式: ${String(transport)}`
          : 'UDP 配置缺失或 hello 消息无效',
      )
      return
    }

    this.sessionId = hello.sessionId
    this.udpServer = hello.udp.server
    this.udpPort = hello.udp.port
    this.aesNonce = hello.udp.nonce
    this.aesKey = Buffer.from(hello.udp.key, 'hex')
    this.localSequence = 0

    logger.info(`UDP 服务器: ${this.udpServer}:${this.udpPort}`)
    // 仅解除等待；onAudioChannelOpenedCallback 由 openAudioChannel 在 UDP socket 就绪后统一触发
    this.serverHelloResolve?.()
  }

  private createUdpSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.udpSocket) {
        try {
          this.udpSocket.close()
        }
        catch (e) {
          logger.error('关闭旧 socket 失败:', e)
        }
      }

      const socket = dgram.createSocket('udp4')
      this.udpSocket = socket

      socket.on('message', (data: Buffer) => {
        this.handleUdpMessage(data)
      })

      socket.on('error', (error) => {
        logger.error('UDP socket 错误:', error)
        if (!this.connected)
          reject(error)
      })

      socket.on('listening', () => {
        const address = socket.address()
        logger.info(`UDP socket 已启动 (隐式绑定) ${address.address}:${address.port}`)
      })

      // 发送空包触发隐式绑定与 NAT 打洞
      socket.send(Buffer.from([0]), this.udpPort, this.udpServer, (err) => {
        if (err) {
          logger.error('发送打洞包失败:', err)
          reject(err)
        }
        else {
          logger.info(`已发送打洞包到 ${this.udpServer}:${this.udpPort}`)
          resolve()
        }
      })
    })
  }

  private handleUdpMessage(data: Buffer): void {
    if (data.length < 16 || !this.aesKey)
      return

    try {
      const decrypted = this.aesCtrDecrypt(this.aesKey, data.subarray(0, 16), data.subarray(16))
      this.onIncomingAudioCallback?.(decrypted)
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
    baseNonce.copy(nonce, 0, 0, 2)
    nonce.writeUInt16BE(dataLength, 2)
    baseNonce.copy(nonce, 4, 4, 12)
    nonce.writeUInt32BE(this.localSequence, 12)
    return nonce
  }

  async sendRawText(message: string): Promise<boolean> {
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
    if (this.isAudioChannelOpened())
      return true

    const ok = await this.connect()
    if (ok && this.onAudioChannelOpenedCallback) {
      await this.onAudioChannelOpenedCallback()
    }
    return ok
  }

  async closeAudioChannel(): Promise<void> {
    this.isClosing = true
    try {
      if (this.sessionId && this.mqttClient?.connected) {
        await this.sendRawText(JSON.stringify({
          type: 'goodbye',
          session_id: this.sessionId,
        }))
      }
      await this.handleGoodbye()
    }
    catch (error) {
      logger.error('关闭音频通道时出错:', error)
      await this.onAudioChannelClosedCallback?.()
    }
    finally {
      this.isClosing = false
    }
  }

  private async handleGoodbye(): Promise<void> {
    await this.cleanupConnection()
    await this.onAudioChannelClosedCallback?.()
  }

  private async handleUnexpectedDisconnect(reason: string): Promise<void> {
    if (this.isClosing || !this.connected)
      return

    logger.warn(`连接异常断开: ${reason}`)
    await this.cleanupConnection()
    await this.onAudioChannelClosedCallback?.()
    this.onNetworkErrorCallback?.(reason)
  }

  private startConnectionMonitor(): void {
    if (this.connectionMonitorTimer)
      clearInterval(this.connectionMonitorTimer)

    this.connectionMonitorTimer = setInterval(() => {
      if (!this.mqttClient?.connected) {
        logger.warn('检测到 MQTT 连接已断开')
        void this.handleUnexpectedDisconnect('连接丢失: MQTT 连接检测失败')
        return
      }

      if (this.lastActivityTime) {
        const elapsed = Date.now() - this.lastActivityTime
        if (elapsed > this.connectionTimeout * 1000) {
          logger.warn(`连接超时，最后活动: ${elapsed / 1000}秒前`)
          void this.handleUnexpectedDisconnect('连接丢失: 连接超时')
        }
      }
    }, 30000)
  }

  private async cleanupConnection(): Promise<void> {
    this.connected = false
    this.serverHelloResolve = null
    if (this.serverHelloTimer) {
      clearTimeout(this.serverHelloTimer)
      this.serverHelloTimer = null
    }

    if (this.connectionMonitorTimer) {
      clearInterval(this.connectionMonitorTimer)
      this.connectionMonitorTimer = null
    }

    if (this.udpSocket) {
      try {
        this.udpSocket.close()
      }
      catch {
        // socket 已关闭
      }
      this.udpSocket = null
    }

    if (this.mqttClient) {
      const client = this.mqttClient
      this.mqttClient = null
      try {
        await client.endAsync(true)
      }
      catch (error) {
        logger.error('断开 MQTT 连接失败:', error)
      }
    }

    this.sessionId = ''
    this.localSequence = 0
    this.udpServer = ''
    this.udpPort = 0
    this.aesKey = null
    this.aesNonce = ''
    this.lastActivityTime = null
  }
}
