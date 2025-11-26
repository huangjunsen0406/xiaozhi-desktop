import type { AxiosError } from 'axios'
import axios from 'axios'
import { showActivation } from '../windows/windowManager'
import { getConfigManager } from './configManagerDB'
import { DeviceFingerprintManager } from './deviceFingerprintDB'

/**
 * 激活结果接口
 */
export interface ActivationResult {
  success: boolean
  needActivationUI: boolean
  message: string
  error?: string
}

/**
 * 激活数据接口
 */
export interface ActivationData {
  challenge: string
  code: string
  message?: string
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
   * 应用启动时的完整初始化流程
   */
  async handleStartup(): Promise<ActivationResult> {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('[激活服务] 开始初始化')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    try {
      // 1. 初始化设备指纹
      await this.initializeDeviceFingerprint()

      // 2. 初始化配置
      await this.initializeConfig()

      // 3. 获取 OTA 配置
      const otaConfig = await this.fetchOtaConfig()

      // 4. 检查激活版本
      const activationVersion = this.configManager.getActivationVersion() || 'v1'
      console.log(`[激活服务] 激活版本: ${activationVersion}`)

      // v1 协议：无需激活
      if (activationVersion === 'v1') {
        console.log('[激活服务] v1 协议，无需激活')
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        return {
          success: true,
          needActivationUI: false,
          message: 'v1 协议初始化完成',
        }
      }

      // v2 协议：分析激活状态
      const result = this.analyzeActivationStatus(otaConfig)

      // 如果需要显示激活界面
      if (result.needActivationUI) {
        showActivation()
      }

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      return result
    }
    catch (error) {
      console.error('[激活服务] 初始化失败:', error)
      return {
        success: false,
        needActivationUI: false,
        message: '初始化失败',
        error: String(error),
      }
    }
  }

  /**
   * 初始化设备指纹
   */
  private async initializeDeviceFingerprint(): Promise<void> {
    if (!this.initialized) {
      this.deviceFingerprint = await DeviceFingerprintManager.getInstanceAsync()
      this.initialized = true

      const [serialNumber, hmacKey, isActivated] = this.deviceFingerprint.ensureDeviceIdentity()
      const macAddress = this.deviceFingerprint.getMacAddressFromEfuse()

      console.log('[激活服务] 设备信息:')
      console.log(`  序列号: ${serialNumber}`)
      console.log(`  MAC: ${macAddress}`)
      console.log(`  HMAC密钥: ${hmacKey ? `${hmacKey.substring(0, 8)}...` : 'null'}`)
      console.log(`  本地状态: ${isActivated ? '已激活' : '未激活'}`)
    }
  }

  /**
   * 初始化配置
   */
  private async initializeConfig(): Promise<void> {
    await this.configManager.initializeDeviceIdAsync()

    console.log('[激活服务] 配置信息:')
    console.log(`  Client ID: ${this.configManager.getClientId()}`)
    console.log(`  Device ID: ${this.configManager.getDeviceId()}`)
  }

  /**
   * 获取 OTA 配置
   */
  private async fetchOtaConfig(): Promise<any> {
    const otaUrl = this.configManager.getOtaVersionUrl()
    const deviceId = this.configManager.getDeviceId()
    const clientId = this.configManager.getClientId()

    if (!otaUrl || !deviceId) {
      throw new Error('OTA URL 或 Device ID 未配置')
    }

    const activationVersion = this.configManager.getActivationVersion()
    const headers: any = {
      'Device-Id': deviceId,
      'Client-Id': clientId,
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

    console.log(`[激活服务] 获取 OTA 配置: ${otaUrl}`)

    try {
      const response = await axios.post(otaUrl, payload, {
        headers,
        timeout: 10000,
      })

      if (response.status !== 200) {
        throw new Error(`OTA 服务器返回错误: ${response.status}`)
      }

      // 更新配置
      const data = response.data
      if (data.mqtt) {
        this.configManager.setMqttInfo(data.mqtt)
        console.log(`  • MQTT Endpoint: ${data.mqtt.endpoint}`)
      }
      if (data.websocket) {
        if (data.websocket.url) {
          this.configManager.setWebsocketUrl(data.websocket.url)
          console.log(`  • WebSocket URL: ${data.websocket.url}`)
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

  /**
   * 分析激活状态
   */
  private analyzeActivationStatus(otaConfig: any): ActivationResult {
    const localActivated = this.deviceFingerprint.isActivated()
    const serverActivated = !otaConfig.activation // 服务器没返回激活码 = 已授权

    // 缓存激活数据
    if (otaConfig.activation) {
      this.cachedActivationData = otaConfig.activation
    }

    console.log('[激活服务] 状态分析:')
    console.log(`  本地: ${localActivated ? '已激活' : '未激活'}`)
    console.log(`  服务器: ${serverActivated ? '已授权' : '需要激活'}`)

    // 情况 1: 都未激活 - 需要激活
    if (!localActivated && !serverActivated) {
      console.log('  → 设备需要激活')
      return {
        success: true,
        needActivationUI: true,
        message: '设备需要激活',
      }
    }

    // 情况 2: 都已激活 - 正常
    if (localActivated && serverActivated) {
      console.log('  → 设备已激活')
      return {
        success: true,
        needActivationUI: false,
        message: '设备已激活',
      }
    }

    // 情况 3: 本地未激活但服务器已授权 - 自动修复
    if (!localActivated && serverActivated) {
      console.log('  → 自动修复本地激活状态')
      this.deviceFingerprint.setActivationStatus(true)
      return {
        success: true,
        needActivationUI: false,
        message: '已自动修复激活状态',
      }
    }

    // 情况 4: 本地已激活但服务器需要激活 - 可能被撤销
    if (localActivated && !serverActivated) {
      console.log('  → 服务器取消授权，需要重新激活')
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

  /**
   * 执行激活流程
   */
  async activate(activationData: ActivationData): Promise<boolean> {
    const { challenge, code } = activationData

    if (!challenge || !code) {
      console.error('[激活服务] 激活数据缺少必要字段')
      return false
    }

    try {
      this.isActivating = true
      this.abortController = new AbortController()

      const serialNumber = this.deviceFingerprint.getSerialNumber()
      if (!serialNumber) {
        console.error('[激活服务] 设备没有序列号')
        return false
      }

      // 计算 HMAC 签名
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
        console.error('[激活服务] OTA URL 未配置')
        return false
      }

      const activateUrl = otaUrl.endsWith('/') ? `${otaUrl}activate` : `${otaUrl}/activate`
      const headers = {
        'Activation-Version': '2',
        'Device-Id': this.configManager.getDeviceId(),
        'Client-Id': this.configManager.getClientId(),
        'Content-Type': 'application/json',
      }

      console.log(`[激活服务] 开始激活: ${activateUrl}`)

      // 重试逻辑（最多 5 分钟）
      const maxRetries = 60
      const retryInterval = 5000

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          console.log(`[激活服务] 尝试 ${attempt + 1}/${maxRetries}`)

          const response = await axios.post(activateUrl, payload, {
            headers,
            timeout: 10000,
            signal: this.abortController.signal,
          })

          if (response.status === 200) {
            console.log('[激活服务] ✅ 激活成功')
            this.deviceFingerprint.setActivationStatus(true)
            return true
          }

          if (response.status === 202) {
            console.log('[激活服务] 等待用户输入验证码...')
            await this.delay(retryInterval)
            continue
          }

          console.warn(`[激活服务] 服务器返回 ${response.status}，继续重试`)
          await this.delay(retryInterval)
        }
        catch (error) {
          if (axios.isCancel(error)) {
            console.log('[激活服务] 激活被取消')
            return false
          }

          if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError
            if (axiosError.response) {
              console.warn(`[激活服务] 服务器错误 (HTTP ${axiosError.response.status})`)
            }
            else if (axiosError.request) {
              console.warn('[激活服务] 网络请求失败，重试中...')
            }
            else {
              console.warn('[激活服务] 请求配置错误:', axiosError.message)
            }
          }
          else {
            console.error('[激活服务] 未知错误:', error)
          }

          await this.delay(retryInterval)
        }
      }

      console.error('[激活服务] 达到最大重试次数')
      return false
    }
    catch (error) {
      console.error('[激活服务] 激活失败:', error)
      return false
    }
    finally {
      this.isActivating = false
      this.abortController = null
    }
  }

  /**
   * 开始激活流程（IPC 入口）
   * 如果没有传入激活数据，则使用缓存的激活数据
   */
  async startActivation(activationData?: ActivationData): Promise<boolean> {
    const data = activationData || this.cachedActivationData
    if (!data) {
      console.error('[激活服务] 没有激活数据')
      return false
    }
    return this.activate(data)
  }

  /**
   * 取消激活
   */
  cancelActivation(): void {
    if (this.abortController) {
      console.log('[激活服务] 取消激活流程')
      this.abortController.abort()
      this.abortController = null
    }
    this.isActivating = false
  }

  /**
   * 获取激活数据（用于 IPC）
   */
  getActivationData(): ActivationData | null {
    return this.cachedActivationData
  }

  /**
   * 检查是否已激活
   */
  isActivated(): boolean {
    return this.deviceFingerprint?.isActivated() || false
  }

  /**
   * 检查是否正在激活
   */
  isActivatingNow(): boolean {
    return this.isActivating
  }

  /**
   * 获取设备信息
   */
  getDeviceInfo() {
    return this.deviceFingerprint?.getDeviceInfo()
  }

  /**
   * 获取设备指纹实例（用于高级访问）
   */
  getDeviceFingerprint(): DeviceFingerprintManager | null {
    return this.deviceFingerprint || null
  }

  /**
   * 延迟辅助函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

/**
 * 获取激活服务单例
 */
export function getActivationService(): ActivationService {
  return ActivationService.getInstance()
}
