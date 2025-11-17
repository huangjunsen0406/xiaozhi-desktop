import axios from 'axios'
import { ActivationManager } from './activationManager'
import { getConfigManager } from './configManagerDB'
import { DeviceFingerprintManager } from './deviceFingerprintDB'

interface ActivationStatus {
  local_activated: boolean
  server_activated: boolean
  status_consistent: boolean
}

interface InitializationResult {
  success: boolean
  need_activation_ui: boolean
  local_activated: boolean
  server_activated: boolean
  status_consistent: boolean
  status_message: string
  activation_data?: any
  error?: string
}

/**
 * 系统初始化器
 * 协调设备指纹、配置管理和 OTA 配置获取
 */
export class SystemInitializer {
  private deviceFingerprint!: DeviceFingerprintManager
  private activationManager: ActivationManager
  private configManager: ReturnType<typeof getConfigManager>
  private activationStatus: ActivationStatus
  private activationData: any = null
  private initialized = false

  constructor() {
    this.activationManager = ActivationManager.getInstance()
    this.configManager = getConfigManager()

    this.activationStatus = {
      local_activated: false,
      server_activated: false,
      status_consistent: true,
    }
  }

  /**
   * 初始化设备指纹（异步）
   */
  private async initializeDeviceFingerprint(): Promise<void> {
    console.log('[SystemInitializer] 开始初始化设备指纹...')
    if (!this.initialized) {
      this.deviceFingerprint = await DeviceFingerprintManager.getInstanceAsync()
      this.initialized = true
      console.log('[SystemInitializer] 设备指纹初始化完成')
    }
    else {
      console.log('[SystemInitializer] 设备指纹已经初始化过了')
    }
  }

  /**
   * 运行完整的初始化流程
   */
  async runInitialization(): Promise<InitializationResult> {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('[系统初始化] 开始系统初始化流程')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    try {
      // 初始化设备指纹
      await this.initializeDeviceFingerprint()

      // 第一阶段：设备身份准备
      await this.stage1DeviceFingerprint()

      // 第二阶段：配置管理初始化（已在构造函数中完成）
      await this.stage2ConfigManagement()

      // 第三阶段：OTA 获取配置
      await this.stage3OtaConfig()

      // 获取激活版本配置
      const activationVersion = this.configManager.getActivationVersion() || 'v1'
      console.log(`[系统初始化] 激活协议版本: ${activationVersion}`)

      // 根据激活版本决定是否需要激活流程
      if (activationVersion === 'v1') {
        // v1 协议：完成前三个阶段后直接返回成功
        console.log('[系统初始化] v1 协议：无需激活流程')
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        return {
          success: true,
          local_activated: true,
          server_activated: true,
          status_consistent: true,
          need_activation_ui: false,
          status_message: 'v1 协议初始化完成',
        }
      }
      else {
        // v2 协议：需要分析激活状态
        console.log('[系统初始化] v2 协议：分析激活状态...')
        const activationResult = this.analyzeActivationStatus()
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        return activationResult
      }
    }
    catch (error) {
      console.error('[系统初始化] 初始化失败:', error)
      return {
        success: false,
        need_activation_ui: false,
        local_activated: false,
        server_activated: false,
        status_consistent: true,
        status_message: '初始化失败',
        error: String(error),
      }
    }
  }

  /**
   * 第一阶段：设备身份准备
   */
  private async stage1DeviceFingerprint(): Promise<void> {
    console.log('[阶段 1/3] 设备身份准备')

    // 确保设备身份信息完整
    const [serialNumber, hmacKey, isActivated] = this.deviceFingerprint.ensureDeviceIdentity()

    // 记录本地激活状态
    this.activationStatus.local_activated = isActivated

    // 获取 MAC 地址
    const macAddress = this.deviceFingerprint.getMacAddressFromEfuse()

    console.log(`  • 设备序列号: ${serialNumber}`)
    console.log(`  • MAC 地址: ${macAddress}`)
    console.log(`  • HMAC 密钥: ${hmacKey ? `${hmacKey.substring(0, 8)}...` : null}`)
    console.log(`  • 本地激活状态: ${isActivated ? '[已激活]' : '[未激活]'}`)
  }

  /**
   * 第二阶段：配置管理初始化
   */
  private async stage2ConfigManagement(): Promise<void> {
    console.log('[阶段 2/3] 配置管理初始化')

    // 异步初始化 DEVICE_ID
    await this.configManager.initializeDeviceIdAsync()

    // 获取关键配置
    const clientId = this.configManager.getClientId()
    const deviceId = this.configManager.getDeviceId()

    console.log(`  • 客户端 ID: ${clientId}`)
    console.log(`  • 设备 ID: ${deviceId}`)
  }

  /**
   * 第三阶段：OTA 获取配置
   */
  private async stage3OtaConfig(): Promise<void> {
    console.log('[阶段 3/3] OTA 配置同步')

    try {
      // 获取 OTA 配置
      const responseData = await this.getOtaConfig()

      console.log('  • OTA 配置获取结果:')
      console.log(`    - MQTT 配置: ${responseData.mqtt ? '[已获取]' : '[未获取]'}`)
      console.log(`    - WebSocket 配置: ${responseData.websocket ? '[已获取]' : '[未获取]'}`)

      // 更新 MQTT 配置
      if (responseData.mqtt) {
        this.configManager.setMqttInfo(responseData.mqtt)
        console.log(`    - MQTT Endpoint: ${responseData.mqtt.endpoint}`)
      }

      // 更新 WebSocket 配置
      if (responseData.websocket) {
        const { url, token } = responseData.websocket
        if (url) {
          this.configManager.setWebsocketUrl(url)
          console.log(`    - WebSocket URL: ${url}`)
        }
        if (token) {
          this.configManager.setWebsocketAccessToken(token)
        }
      }

      // 检查是否有激活信息
      if (responseData.activation) {
        console.log('[激活] 服务端返回激活码，设备需要重新激活')
        this.activationData = responseData.activation
        this.activationStatus.server_activated = false
      }
      else {
        console.log('[激活] 服务端确认设备已授权')
        this.activationData = null
        this.activationStatus.server_activated = true
      }
    }
    catch (error) {
      console.error('[系统初始化] OTA 配置获取失败:', error)
      throw error
    }

    if (this.activationData) {
      console.log('完成第三阶段：OTA 配置同步完成（需要激活）')
    }
    else {
      console.log('完成第三阶段：OTA 配置同步完成（已授权）')
    }
  }

  /**
   * 获取 OTA 配置
   */
  private async getOtaConfig(): Promise<any> {
    const otaUrl = this.configManager.getOtaVersionUrl()
    const deviceId = this.configManager.getDeviceId()
    const clientId = this.configManager.getClientId()

    if (!otaUrl) {
      throw new Error('OTA URL 未配置')
    }

    if (!deviceId) {
      throw new Error('设备 ID 未配置')
    }

    // 构建请求头
    const headers: any = {
      'Device-Id': deviceId,
      'Client-Id': clientId,
      'Content-Type': 'application/json',
      'Accept-Language': 'zh-CN',
    }

    // v2 协议添加 Activation-Version 头部
    const activationVersion = this.configManager.getActivationVersion()
    if (activationVersion === 'v2') {
      headers['Activation-Version'] = '2'
    }

    // 构建请求负载
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

    try {
      const response = await axios.post(otaUrl, payload, {
        headers,
        timeout: 10000,
      })

      if (response.status !== 200) {
        throw new Error(`OTA 服务器返回错误状态码: ${response.status}`)
      }

      return response.data
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
  private analyzeActivationStatus(): InitializationResult {
    const localActivated = this.activationStatus.local_activated
    const serverActivated = this.activationStatus.server_activated

    // 检查状态是否一致
    const statusConsistent = localActivated === serverActivated
    this.activationStatus.status_consistent = statusConsistent

    const result: InitializationResult = {
      success: true,
      local_activated: localActivated,
      server_activated: serverActivated,
      status_consistent: statusConsistent,
      need_activation_ui: false,
      status_message: '',
      activation_data: this.activationData,
    }

    // 情况 1：本地未激活，服务器返回激活数据 - 正常激活流程
    if (!localActivated && !serverActivated) {
      console.log('[状态] 设备需要首次激活')
      result.need_activation_ui = true
      result.status_message = '设备需要激活'
    }
    // 情况 2：本地已激活，服务器无激活数据 - 正常已激活状态
    else if (localActivated && serverActivated) {
      console.log('[状态] 设备已激活，可正常使用')
      result.need_activation_ui = false
      result.status_message = '设备已激活'
    }
    // 情况 3：本地未激活，但服务器无激活数据 - 状态不一致，自动修复
    else if (!localActivated && serverActivated) {
      console.log('[状态] 状态不一致：自动修复本地激活状态')
      this.deviceFingerprint.setActivationStatus(true)
      result.need_activation_ui = false
      result.status_message = '已自动修复激活状态'
      result.local_activated = true
    }
    // 情况 4：本地已激活，但服务器返回激活数据 - 状态不一致
    else if (localActivated && !serverActivated) {
      if (this.activationData && this.activationData.code) {
        console.log('[警告] 状态不一致：服务端已取消授权，需要重新激活')
        console.log(`   验证码: ${this.activationData.code}`)
        result.need_activation_ui = true
        result.status_message = '激活状态不一致，需要重新激活'
      }
      else {
        console.log('[状态] 保持本地激活状态')
        result.need_activation_ui = false
        result.status_message = '保持本地激活状态'
        result.status_consistent = true
        this.activationStatus.status_consistent = true
        this.activationStatus.server_activated = true
      }
    }

    return result
  }

  /**
   * 获取激活数据
   */
  getActivationData(): any {
    return this.activationData
  }

  /**
   * 获取设备指纹实例
   */
  getDeviceFingerprint(): DeviceFingerprintManager {
    return this.deviceFingerprint
  }

  /**
   * 获取激活管理器实例
   */
  getActivationManager(): ActivationManager {
    return this.activationManager
  }

  /**
   * 获取激活状态
   */
  getActivationStatus(): ActivationStatus {
    return { ...this.activationStatus }
  }
}
