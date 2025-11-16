import { v4 as uuidv4 } from 'uuid'
import { DatabaseManager } from './database'

/**
 * 配置管理器 (SQLite 版本) - 单例模式
 */
export class ConfigManager {
  private static instance: ConfigManager | null = null
  private db: DatabaseManager

  // 默认配置
  private static DEFAULT_CONFIG = {
    OTA_VERSION_URL: 'https://api.tenclass.net/xiaozhi/ota/',
    ACTIVATION_VERSION: 'v2',
    AUTHORIZATION_URL: 'https://xiaozhi.me/',
  }

  private constructor() {
    this.db = DatabaseManager.getInstance()
    this.initializeDefaultConfig()
  }

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager()
    }
    return ConfigManager.instance
  }

  /**
   * 初始化默认配置
   */
  private initializeDefaultConfig(): void {
    // 确保 CLIENT_ID 存在
    let clientId = this.getClientId()
    if (!clientId) {
      clientId = uuidv4()
      this.setClientId(clientId)
      console.log(`[ConfigManager] 已生成 CLIENT_ID: ${clientId}`)
    }

    // 确保网络配置记录存在
    const config = this.db.getNetworkConfig()
    if (!config) {
      this.db.getOrCreateNetworkConfig({ client_id: clientId })
      console.log('[ConfigManager] 已创建网络配置记录')
    }
  }

  /**
   * 初始化 DEVICE_ID（从设备指纹获取 MAC 地址）
   */
  async initializeDeviceIdAsync(): Promise<void> {
    const { DeviceFingerprintManager } = await import('./deviceFingerprintDB')
    const deviceFingerprint = await DeviceFingerprintManager.getInstanceAsync()
    const macAddress = deviceFingerprint.getMacAddressFromEfuse()

    if (macAddress && macAddress !== this.getDeviceId()) {
      this.setDeviceId(macAddress)
      console.log(`[ConfigManager] 已设置 DEVICE_ID: ${macAddress}`)
    }
  }

  /**
   * 获取完整配置（扁平格式）
   */
  getAll(): Record<string, any> {
    return this.db.getAllConfig()
  }

  /* ==================== 类型安全的配置访问方法 ==================== */

  getClientId(): string {
    const config = this.db.getNetworkConfig()
    return config?.client_id || ''
  }

  setClientId(value: string): boolean {
    try {
      this.db.updateNetworkConfig('client_id', value)
      return true
    }
    catch (error) {
      console.error('[ConfigManager] 设置 CLIENT_ID 失败:', error)
      return false
    }
  }

  getDeviceId(): string {
    const config = this.db.getNetworkConfig()
    return config?.device_id || ''
  }

  setDeviceId(value: string): boolean {
    try {
      this.db.updateNetworkConfig('device_id', value)
      return true
    }
    catch (error) {
      console.error('[ConfigManager] 设置 DEVICE_ID 失败:', error)
      return false
    }
  }

  getOtaVersionUrl(): string {
    const config = this.db.getNetworkConfig()
    return config?.ota_version_url || ConfigManager.DEFAULT_CONFIG.OTA_VERSION_URL
  }

  setOtaVersionUrl(value: string): boolean {
    try {
      this.db.updateNetworkConfig('ota_version_url', value)
      return true
    }
    catch (error) {
      console.error('[ConfigManager] 设置 OTA_VERSION_URL 失败:', error)
      return false
    }
  }

  getWebsocketUrl(): string | null {
    const config = this.db.getNetworkConfig()
    return config?.websocket_url || null
  }

  setWebsocketUrl(value: string | null): boolean {
    try {
      this.db.updateNetworkConfig('websocket_url', value)
      return true
    }
    catch (error) {
      console.error('[ConfigManager] 设置 WEBSOCKET_URL 失败:', error)
      return false
    }
  }

  getWebsocketAccessToken(): string | null {
    const config = this.db.getNetworkConfig()
    return config?.websocket_access_token || null
  }

  setWebsocketAccessToken(value: string | null): boolean {
    try {
      this.db.updateNetworkConfig('websocket_access_token', value)
      return true
    }
    catch (error) {
      console.error('[ConfigManager] 设置 WEBSOCKET_ACCESS_TOKEN 失败:', error)
      return false
    }
  }

  getMqttInfo(): any {
    const config = this.db.getNetworkConfig()
    if (!config || !config.mqtt_endpoint) {
      return null
    }
    return {
      endpoint: config.mqtt_endpoint,
      client_id: config.mqtt_client_id,
      username: config.mqtt_username,
      password: config.mqtt_password,
      publish_topic: config.mqtt_publish_topic,
      subscribe_topic: config.mqtt_subscribe_topic,
    }
  }

  setMqttInfo(value: any): boolean {
    try {
      if (typeof value === 'object' && value !== null) {
        this.db.updateNetworkConfigBatch({
          mqtt_endpoint: value.endpoint || null,
          mqtt_client_id: value.client_id || null,
          mqtt_username: value.username || null,
          mqtt_password: value.password || null,
          mqtt_publish_topic: value.publish_topic || null,
          mqtt_subscribe_topic: value.subscribe_topic || null,
        })
      }
      return true
    }
    catch (error) {
      console.error('[ConfigManager] 设置 MQTT_INFO 失败:', error)
      return false
    }
  }

  getActivationVersion(): string {
    const config = this.db.getNetworkConfig()
    return config?.activation_version || ConfigManager.DEFAULT_CONFIG.ACTIVATION_VERSION
  }

  setActivationVersion(value: string): boolean {
    try {
      this.db.updateNetworkConfig('activation_version', value)
      return true
    }
    catch (error) {
      console.error('[ConfigManager] 设置 ACTIVATION_VERSION 失败:', error)
      return false
    }
  }

  getAuthorizationUrl(): string {
    const config = this.db.getNetworkConfig()
    return config?.authorization_url || ConfigManager.DEFAULT_CONFIG.AUTHORIZATION_URL
  }

  setAuthorizationUrl(value: string): boolean {
    try {
      this.db.updateNetworkConfig('authorization_url', value)
      return true
    }
    catch (error) {
      console.error('[ConfigManager] 设置 AUTHORIZATION_URL 失败:', error)
      return false
    }
  }

  /**
   * 批量更新配置
   */
  updateBatch(updates: Record<string, any>): boolean {
    try {
      this.db.updateNetworkConfigBatch(updates)
      return true
    }
    catch (error) {
      console.error('[ConfigManager] 批量更新配置失败:', error)
      return false
    }
  }
}

// 导出单例获取函数
export function getConfigManager(): ConfigManager {
  return ConfigManager.getInstance()
}
