import type { ActivationData } from '@shared/types'
import type { AxiosError } from 'axios'
import axios from 'axios'
import { getLogger } from '../utils/logger'
import { hideActivation, showActivation } from '../windows/windowManager'

import { getConfigManager } from './configManagerDB'
import { DeviceFingerprintManager } from './deviceFingerprintDB'

/**
 * 激活结果接口（本地扩展）
 */
export interface ActivationResult {
  success: boolean
  needActivationUI: boolean
  message: string
  error?: string
}

/**
 * 统一激活服务
 * 整合所有激活相关功能（合并自 systemInitializer、activationManager、activationHandler）
 */
export class ActivationService {
  private static instance: ActivationService | null = null

  private deviceFingerprint!: DeviceFingerprintManager
  private configManager: ReturnType<typeof getConfigManager>
  private initialized = false
  private logger = getLogger('ActivationService') // 移到类内部

  // 激活流程控制
  private isActivating = false
  private abortController: AbortController | null = null

  // 激活数据缓存
  private cachedActivationData: ActivationData | null = null

  private constructor() {
    this.configManager = getConfigManager()
  }

  static getInstance(): ActivationService {
    if (!ActivationService.instance) {
      ActivationService.instance = new ActivationService()
    }
    return ActivationService.instance
  }

  /**
   * 初始化基础设备信息
   */
  async initializeBasic(): Promise<ActivationResult> {
    this.logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    this.logger.info('开始初始化基础设备信息')
    this.logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    try {
      this.initializeDeviceFingerprint()
      await this.initializeConfig()

      this.logger.info('基础设备信息初始化完成')
      return {
        success: true,
        needActivationUI: false,
        message: '基础设备信息初始化完成',
      }
    }
    catch (error) {
      this.logger.error('基础初始化失败', error)
      return {
        success: false,
        needActivationUI: false,
        message: '基础初始化失败',
        error: String(error),
      }
    }
  }

  /**
   * 检查激活状态
   */
  async checkActivationStatus(): Promise<ActivationResult> {
    this.logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    this.logger.info('开始检查激活状态')
    this.logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    try {
      const otaConfig = await this.fetchOtaConfig()

      this.logger.info('OTA 配置:', otaConfig)
      const activationVersion = this.configManager.getActivationVersion() || 'v1'
      this.logger.info(`激活版本: ${activationVersion}`)

      if (activationVersion === 'v1') {
        this.logger.info('v1 协议，跳过激活检查')
        return {
          success: true,
          needActivationUI: false,
          message: 'v1 协议，跳过激活检查',
        }
      }

      const result = this.analyzeActivationStatus(otaConfig)

      this.logger.info('分析激活状态:', result)

      if (result.needActivationUI) {
        showActivation()
      }
      else {
        hideActivation()
      }

      return result
    }
    catch (error) {
      this.logger.error('激活状态检查失败', error)
      // 不返回 success: false，避免阻止应用运行
      return {
        success: true, // 注意：这里返回 true，允许应用继续运行
        needActivationUI: false,
        message: '激活状态检查失败（已忽略）',
        error: String(error),
      }
    }
  }

  private initializeDeviceFingerprint(): void {
    if (!this.initialized) {
      this.deviceFingerprint = DeviceFingerprintManager.getInstance()
      this.initialized = true

      const [serialNumber, hmacKey, isActivated] = this.deviceFingerprint.ensureDeviceIdentity()
      const macAddress = this.deviceFingerprint.getMacAddressFromEfuse()

      this.logger.info('设备指纹信息:')
      this.logger.info(`  序列号: ${serialNumber}`)
      this.logger.info(`  MAC: ${macAddress}`)
      this.logger.info(`  HMAC密钥: ${hmacKey ? `${hmacKey.substring(0, 8)}...` : 'null'}`)
      this.logger.info(`  本地状态: ${isActivated ? '已激活' : '未激活'}`)
    }
  }

  private async initializeConfig(): Promise<void> {
    await this.configManager.initializeDeviceIdAsync()

    this.logger.info('配置信息:')
    this.logger.info(`  Client ID: ${this.configManager.getClientId()}`)
    this.logger.info(`  Device ID: ${this.configManager.getDeviceId()}`)
  }

  private async fetchOtaConfig(): Promise<{
    mqtt?: Record<string, string>
    websocket?: { url?: string, token?: string }
    activation?: { challenge: string, code: string, message?: string }
  }> {
    const otaUrl = this.configManager.getOtaVersionUrl()
    const deviceId = this.configManager.getDeviceId()
    const clientId = this.configManager.getClientId()

    if (!otaUrl || !deviceId) {
      throw new Error('OTA URL 或 Device ID 未配置')
    }

    const activationVersion = this.configManager.getActivationVersion()
    const headers: Record<string, string> = {
      'Device-Id': deviceId,
      'Client-Id': clientId || '',
      'Content-Type': 'application/json',
      'Accept-Language': 'zh-CN',
    }

    if (activationVersion === 'v2') {
      headers['Activation-Version'] = '2'
    }

    const hmacKey = this.deviceFingerprint.getHmacKey()
    const payload = {
      application: {
        version: '2.0.0',
        elf_sha256: hmacKey || 'unknown',
      },
      board: {
        type: 'desktop',
        name: 'xiaozhi-desktop',
        ip: '127.0.0.1',
        mac: deviceId,
      },
    }

    this.logger.info('OTA 配置请求头:', headers)

    this.logger.info('OTA 配置请求参数:', payload)

    this.logger.info(`获取 OTA 配置: ${otaUrl}`)

    try {
      const response = await axios.post(otaUrl, payload, {
        headers,
        timeout: 10000,
      })

      this.logger.info('OTA 配置响应:', response)

      if (response.status !== 200) {
        throw new Error(`OTA 服务器返回错误: ${response.status}`)
      }

      // 更新配置
      const data = response.data
      if (data.mqtt) {
        this.configManager.setMqttInfo(data.mqtt)
        this.logger.info(`  • MQTT Endpoint: ${data.mqtt.endpoint}`)
      }
      if (data.websocket) {
        if (data.websocket.url) {
          this.configManager.setWebsocketUrl(data.websocket.url)
          this.logger.info(`  • WebSocket URL: ${data.websocket.url}`)
        }
        if (data.websocket.token) {
          this.configManager.setWebsocketAccessToken(data.websocket.token)
        }
      }

      return data
    }
    catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED') {
          throw new Error('OTA 请求超时')
        }
        else if (error.response) {
          throw new Error(`OTA 服务器错误: HTTP ${error.response.status}`)
        }
        else if (error.request) {
          throw new Error('无法连接到 OTA 服务器')
        }
      }
      throw error
    }
  }

  private analyzeActivationStatus(otaConfig: { activation?: { challenge: string, code: string, message?: string } }): ActivationResult {
    const localActivated = this.deviceFingerprint.isActivated()
    const serverActivated = !otaConfig.activation

    if (otaConfig.activation) {
      this.cachedActivationData = otaConfig.activation
    }

    this.logger.info('分析激活状态:')
    this.logger.info(`  本地: ${localActivated ? '已激活' : '未激活'}`)
    this.logger.info(`  服务器: ${serverActivated ? '已授权' : '需要激活'}`)

    if (!localActivated && !serverActivated) {
      this.logger.info('  → 设备需要激活')
      return {
        success: true,
        needActivationUI: true,
        message: '设备需要激活',
      }
    }

    if (localActivated && serverActivated) {
      this.logger.info('  → 设备已激活')

      return {
        success: true,
        needActivationUI: false,
        message: '设备已激活',
      }
    }

    if (!localActivated && serverActivated) {
      this.logger.info('  → 自动修复本地激活状态')
      this.deviceFingerprint.setActivationStatus(true)
      return {
        success: true,
        needActivationUI: false,
        message: '已自动修复激活状态',
      }
    }

    if (localActivated && !serverActivated) {
      this.logger.info('  → 服务器取消授权，需要重新激活')
      return {
        success: true,
        needActivationUI: true,
        message: '服务器取消授权，需要重新激活',
      }
    }

    return {
      success: true,
      needActivationUI: false,
      message: '未知状态',
    }
  }

  async activate(activationData: ActivationData): Promise<boolean> {
    const { challenge, code } = activationData

    if (!challenge || !code) {
      this.logger.error('激活数据缺少必要字段')
      return false
    }

    try {
      this.isActivating = true
      this.abortController = new AbortController()

      const serialNumber = this.deviceFingerprint.getSerialNumber()
      if (!serialNumber) {
        this.logger.error('设备没有序列号')
        return false
      }

      const hmacSignature = this.deviceFingerprint.generateHmacSignature(challenge)

      const payload = {
        Payload: {
          algorithm: 'hmac-sha256',
          serial_number: serialNumber,
          challenge,
          hmac: hmacSignature,
        },
      }

      const otaUrl = this.configManager.getOtaVersionUrl()
      if (!otaUrl) {
        this.logger.error('OTA URL 未配置')
        return false
      }

      const activateUrl = otaUrl.endsWith('/') ? `${otaUrl}activate` : `${otaUrl}/activate`
      const headers = {
        'Activation-Version': '2',
        'Device-Id': this.configManager.getDeviceId(),
        'Client-Id': this.configManager.getClientId(),
        'Content-Type': 'application/json',
      }

      this.logger.info(`开始激活: ${activateUrl}`)

      const maxRetries = 60
      const retryInterval = 5000

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          this.logger.info(`尝试 ${attempt + 1}/${maxRetries}`)

          const response = await axios.post(activateUrl, payload, {
            headers,
            timeout: 10000,
            signal: this.abortController.signal,
          })

          if (response.status === 200) {
            this.logger.info('激活成功')
            this.deviceFingerprint.setActivationStatus(true)

            return true
          }

          if (response.status === 202) {
            this.logger.info('服务器处理中，等待重试')
            await this.delay(retryInterval)
            continue
          }

          this.logger.warn(`服务器返回 ${response.status}，继续重试`)
          await this.delay(retryInterval)
        }
        catch (error) {
          if (axios.isCancel(error)) {
            this.logger.info('激活已取消')
            return false
          }

          if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError
            if (axiosError.response) {
              this.logger.warn(`服务器错误 (HTTP ${axiosError.response.status})`)
            }
            else if (axiosError.request) {
              this.logger.warn('无法连接到激活服务器')
            }
            else {
              this.logger.warn('请求配置错误:', axiosError.message)
            }
          }
          else {
            this.logger.error('激活失败', error)
          }

          await this.delay(retryInterval)
        }
      }

      this.logger.error('达到最大重试次数')
      return false
    }
    catch (error) {
      this.logger.error('初始化失败', error)
      return false
    }
    finally {
      this.isActivating = false
      this.abortController = null
    }
  }

  async startActivation(activationData?: ActivationData): Promise<boolean> {
    const data = activationData || this.cachedActivationData
    if (!data) {
      this.logger.error('没有激活数据')
      return false
    }
    return this.activate(data)
  }

  cancelActivation(): void {
    if (this.abortController) {
      this.logger.info('取消激活')
      this.abortController.abort()
      this.abortController = null
    }
    this.isActivating = false
  }

  getActivationData(): ActivationData | null {
    return this.cachedActivationData
  }

  isActivated(): boolean {
    return this.deviceFingerprint?.isActivated() || false
  }

  isActivatingNow(): boolean {
    return this.isActivating
  }

  getDeviceInfo() {
    return this.deviceFingerprint?.getDeviceInfo()
  }

  getDeviceFingerprint(): DeviceFingerprintManager | null {
    return this.deviceFingerprint || null
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

export function getActivationService(): ActivationService {
  return ActivationService.getInstance()
}
