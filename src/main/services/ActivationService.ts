import type { ActivationData, OtaConfigResponse } from '@shared/types'
import type { ConfigManager } from './configManagerDB'
import type { DeviceFingerprintManager } from './deviceFingerprintDB'
import axios from 'axios'
import { getLogger } from '../utils/logger'
import { hideActivation, showActivation } from '../windows/windowManager'
import { getConfigManager } from './configManagerDB'
import { getDeviceFingerprint } from './deviceFingerprintDB'

export interface ActivationResult {
  success: boolean
  needActivationUI: boolean
  message: string
  error?: string
}

let _activationService: ActivationService | null = null

function describeAxiosError(error: unknown, target: string): string {
  if (!axios.isAxiosError(error))
    return `${target}异常: ${error}`
  if (error.code === 'ECONNABORTED')
    return `${target}超时`
  if (error.response)
    return `${target}服务器错误: HTTP ${error.response.status}`
  if (error.request)
    return `无法连接到${target}服务器`
  return `${target}请求失败: ${error.message}`
}

export class ActivationService {
  private deviceFingerprint: DeviceFingerprintManager
  private configManager: ConfigManager
  private identityEnsured = false
  private logger = getLogger('ActivationService')
  private isActivating = false
  private abortController: AbortController | null = null
  private cachedActivationData: ActivationData | null = null

  private constructor(configManager: ConfigManager, deviceFingerprint: DeviceFingerprintManager) {
    this.configManager = configManager
    this.deviceFingerprint = deviceFingerprint
  }

  static create(
    configManager?: ConfigManager,
    deviceFingerprint?: DeviceFingerprintManager,
  ): ActivationService {
    if (_activationService)
      return _activationService
    _activationService = new ActivationService(
      configManager ?? getConfigManager(),
      deviceFingerprint ?? getDeviceFingerprint(),
    )
    return _activationService
  }

  static resetInstance(): void {
    _activationService = null
  }

  async initializeBasic(): Promise<ActivationResult> {
    this.logger.info('开始初始化基础设备信息')
    try {
      this.ensureDeviceIdentityLogged()
      await this.configManager.initializeDeviceIdAsync()
      this.logger.info('基础设备信息初始化完成', {
        clientId: this.configManager.getClientId(),
        deviceId: this.configManager.getDeviceId(),
      })
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

  async checkActivationStatus(): Promise<ActivationResult> {
    this.logger.info('开始检查激活状态')
    try {
      const otaConfig = await this.fetchOtaConfig()
      this.logger.info('OTA 配置:', otaConfig)

      const activationVersion = this.configManager.getActivationVersion() || 'v1'
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

      if (result.needActivationUI)
        showActivation()
      else
        hideActivation()

      return result
    }
    catch (error) {
      this.logger.error('激活状态检查失败', error)
      // 不阻止应用继续运行，同时保留 error 字段供调用方感知
      return {
        success: true,
        needActivationUI: false,
        message: '激活状态检查失败（已忽略）',
        error: String(error),
      }
    }
  }

  private ensureDeviceIdentityLogged(): void {
    if (this.identityEnsured)
      return
    this.identityEnsured = true
    const [serialNumber, hmacKey, isActivated] = this.deviceFingerprint.ensureDeviceIdentity()
    const macAddress = this.deviceFingerprint.getMacAddressFromEfuse()
    this.logger.info('设备指纹信息:', {
      serialNumber,
      macAddress,
      hmacKeyPrefix: hmacKey ? `${hmacKey.substring(0, 8)}...` : null,
      isActivated,
    })
  }

  private async fetchOtaConfig(): Promise<OtaConfigResponse> {
    const otaUrl = this.configManager.getOtaVersionUrl()
    const deviceId = this.configManager.getDeviceId()
    const clientId = this.configManager.getClientId()

    if (!otaUrl || !deviceId) {
      throw new Error('OTA URL 或 Device ID 未配置')
    }

    const headers: Record<string, string> = {
      'Device-Id': deviceId,
      'Client-Id': clientId || '',
      'Content-Type': 'application/json',
      'Accept-Language': 'zh-CN',
    }
    if (this.configManager.getActivationVersion() === 'v2') {
      headers['Activation-Version'] = '2'
    }

    const payload = {
      application: {
        version: '2.0.0',
        elf_sha256: this.deviceFingerprint.getHmacKey() || 'unknown',
      },
      board: {
        type: 'desktop',
        name: 'xiaozhi-desktop',
        ip: '127.0.0.1',
        mac: deviceId,
      },
    }

    this.logger.info(`获取 OTA 配置: ${otaUrl}`)

    const maxAttempts = 3
    let lastError: unknown = null

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        if (attempt > 1) {
          const delayMs = (attempt - 1) * 2000
          this.logger.info(`OTA 第 ${attempt}/${maxAttempts} 次重试，等待 ${delayMs}ms`)
          await this.delay(delayMs)
        }

        const response = await axios.post<OtaConfigResponse>(otaUrl, payload, {
          headers,
          timeout: 10000,
        })

        if (response.status !== 200) {
          throw new Error(`OTA 服务器返回错误: ${response.status}`)
        }

        const data = response.data
        if (data.websocket) {
          if (data.websocket.url)
            this.configManager.setWebsocketUrl(data.websocket.url)
          if (data.websocket.token)
            this.configManager.setWebsocketAccessToken(data.websocket.token)
          this.logger.info(`  • WebSocket URL: ${data.websocket.url}`)
        }
        if (data.mqtt) {
          this.configManager.setMqttInfo({
            endpoint: data.mqtt.endpoint ?? null,
            client_id: data.mqtt.client_id ?? null,
            username: data.mqtt.username ?? null,
            password: data.mqtt.password ?? null,
            publish_topic: data.mqtt.publish_topic ?? null,
            subscribe_topic: data.mqtt.subscribe_topic ?? null,
          })
          this.logger.info(`  • MQTT Endpoint: ${data.mqtt.endpoint}`)
        }

        return data
      }
      catch (error) {
        lastError = error
        this.logger.warn(`${describeAxiosError(error, 'OTA')} (第 ${attempt}/${maxAttempts} 次)`)
        if (attempt === maxAttempts) {
          this.logger.error(`OTA 请求已达最大重试次数 (${maxAttempts})，放弃重试`)
        }
      }
    }

    if (axios.isAxiosError(lastError)) {
      throw new Error(describeAxiosError(lastError, 'OTA'))
    }
    throw lastError
  }

  private analyzeActivationStatus(otaConfig: Pick<OtaConfigResponse, 'activation'>): ActivationResult {
    const localActivated = this.deviceFingerprint.isActivated()
    const serverActivated = !otaConfig.activation

    if (otaConfig.activation) {
      this.cachedActivationData = otaConfig.activation
    }

    if (!localActivated && !serverActivated) {
      return { success: true, needActivationUI: true, message: '设备需要激活' }
    }
    if (localActivated && serverActivated) {
      return { success: true, needActivationUI: false, message: '设备已激活' }
    }
    if (!localActivated && serverActivated) {
      this.logger.info('自动修复本地激活状态')
      this.deviceFingerprint.setActivationStatus(true)
      return { success: true, needActivationUI: false, message: '已自动修复激活状态' }
    }
    return { success: true, needActivationUI: true, message: '服务器取消授权，需要重新激活' }
  }

  async activate(activationData: ActivationData): Promise<boolean> {
    const { challenge, code } = activationData
    if (!challenge || !code) {
      this.logger.error('激活数据缺少必要字段')
      return false
    }

    const serialNumber = this.deviceFingerprint.getSerialNumber()
    if (!serialNumber) {
      this.logger.error('设备没有序列号')
      return false
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
    const payload = {
      Payload: {
        algorithm: 'hmac-sha256',
        serial_number: serialNumber,
        challenge,
        hmac: this.deviceFingerprint.generateHmacSignature(challenge),
      },
    }

    this.isActivating = true
    this.abortController = new AbortController()
    this.logger.info(`开始激活: ${activateUrl}`)

    try {
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

          this.logger.info(
            response.status === 202
              ? '服务器处理中，等待重试'
              : `服务器返回 ${response.status}，继续重试`,
          )
        }
        catch (error) {
          if (axios.isCancel(error)) {
            this.logger.info('激活已取消')
            return false
          }
          this.logger.warn(describeAxiosError(error, '激活'))
        }

        await this.delay(retryInterval)
      }

      this.logger.error('达到最大重试次数')
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
    return this.deviceFingerprint.isActivated()
  }

  isActivatingNow(): boolean {
    return this.isActivating
  }

  getDeviceInfo() {
    return this.deviceFingerprint.getDeviceInfo()
  }

  getDeviceFingerprint(): DeviceFingerprintManager {
    return this.deviceFingerprint
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

export function getActivationService(): ActivationService {
  if (!_activationService) {
    throw new Error(
      'ActivationService not initialized. Call ActivationService.create() during app bootstrap before getActivationService().',
    )
  }
  return _activationService
}
