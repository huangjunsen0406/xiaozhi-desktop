import type { MqttInfo } from '@shared/types'
import type { DatabaseManager } from './database'
import { v4 as uuidv4 } from 'uuid'
import { getLogger } from '../utils/logger'
import { getDatabase } from './database'
import { getDeviceFingerprint } from './deviceFingerprintDB'

export type { MqttInfo }

/**
 * 进程级配置管理器（显式初始化，禁止懒 getInstance）
 *
 * 启动：initializeDatabase → initializeConfigManager → getConfigManager
 */
let _configManager: ConfigManager | null = null

/**
 * 显式初始化配置管理器（依赖已 initializeDatabase）
 */
export function initializeConfigManager(db?: DatabaseManager): ConfigManager {
  if (_configManager) {
    return _configManager
  }
  _configManager = new ConfigManager(db ?? getDatabase())
  return _configManager
}

/**
 * 获取已初始化的配置管理器；未初始化则抛错
 */
export function getConfigManager(): ConfigManager {
  if (!_configManager) {
    throw new Error(
      'ConfigManager not initialized. Call initializeConfigManager() during app bootstrap before getConfigManager().',
    )
  }
  return _configManager
}

/**
 * 重置配置管理器引用（仅测试用）
 */
export function resetConfigManager(): void {
  _configManager = null
}

export class ConfigManager {
  private db: DatabaseManager
  private logger = getLogger('ConfigManagerDB')

  private static DEFAULT_CONFIG = {
    OTA_VERSION_URL: 'https://api.tenclass.net/xiaozhi/ota/',
    ACTIVATION_VERSION: 'v2',
    AUTHORIZATION_URL: 'https://xiaozhi.me/',
  }

  /** Created by initializeConfigManager(); use getConfigManager() in business code. */
  constructor(db: DatabaseManager) {
    this.db = db
    this.initializeDefaultConfig()
  }

  private initializeDefaultConfig(): void {
    let clientId = this.getClientId()
    if (!clientId) {
      clientId = uuidv4()
      this.setClientId(clientId)
      this.logger.info(`已生成 CLIENT_ID: ${clientId}`)
    }

    const config = this.db.getNetworkConfig()
    if (!config) {
      this.db.getOrCreateNetworkConfig({ client_id: clientId })
      this.logger.info('已创建网络配置记录')
    }
  }

  async initializeDeviceIdAsync(): Promise<void> {
    const deviceFingerprint = getDeviceFingerprint()
    const macAddress = deviceFingerprint.getMacAddressFromEfuse()
    const currentDeviceId = this.getDeviceId().trim()

    // Only backfill a default device ID on empty config.
    // If a user has explicitly configured one, preserve it.
    if (!currentDeviceId && macAddress) {
      this.setDeviceId(macAddress)
      this.logger.info(`已回填默认 DEVICE_ID: ${macAddress}`)
    }
  }

  getAll(): Record<string, unknown> {
    return this.db.getAllConfig()
  }

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
      this.logger.error('设置 CLIENT_ID 失败', error)
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
      this.logger.error('设置 DEVICE_ID 失败', error)
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
      this.logger.error('设置 OTA_VERSION_URL 失败', error)
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
      this.logger.error('设置 WEBSOCKET_URL 失败', error)
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
      this.logger.error('设置 WEBSOCKET_ACCESS_TOKEN 失败', error)
      return false
    }
  }

  getMqttInfo(): MqttInfo | null {
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

  setMqttInfo(value: MqttInfo | null): boolean {
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
      this.logger.error('设置 MQTT_INFO 失败', error)
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
      this.logger.error('设置 ACTIVATION_VERSION 失败', error)
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
      this.logger.error('设置 AUTHORIZATION_URL 失败', error)
      return false
    }
  }

  updateBatch(updates: Record<string, string | null>): boolean {
    try {
      this.db.updateNetworkConfigBatch(updates)
      return true
    }
    catch (error) {
      this.logger.error('批量更新配置失败', error)
      return false
    }
  }
}
