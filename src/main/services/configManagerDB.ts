import type { MqttInfo } from '@shared/types'
import type { DatabaseManager } from './database'
import { v4 as uuidv4 } from 'uuid'
import { getLogger } from '../utils/logger'
import { getDatabase } from './database'
import { getDeviceFingerprint } from './deviceFingerprintDB'

export type { MqttInfo }

export const DEFAULT_NETWORK_CONFIG = {
  OTA_VERSION_URL: 'https://api.tenclass.net/xiaozhi/ota/',
  ACTIVATION_VERSION: 'v2',
  AUTHORIZATION_URL: 'https://xiaozhi.me/',
} as const

let _configManager: ConfigManager | null = null

export function initializeConfigManager(db?: DatabaseManager): ConfigManager {
  if (_configManager)
    return _configManager
  _configManager = new ConfigManager(db ?? getDatabase())
  return _configManager
}

export function getConfigManager(): ConfigManager {
  if (!_configManager) {
    throw new Error(
      'ConfigManager not initialized. Call initializeConfigManager() during app bootstrap before getConfigManager().',
    )
  }
  return _configManager
}

export function resetConfigManager(): void {
  _configManager = null
}

type NetworkStringField
  = | 'client_id'
    | 'device_id'
    | 'ota_version_url'
    | 'activation_version'
    | 'authorization_url'
    | 'websocket_url'
    | 'websocket_access_token'

export class ConfigManager {
  private logger = getLogger('ConfigManagerDB')

  constructor(private db: DatabaseManager) {
    if (!this.getClientId()) {
      const clientId = uuidv4()
      this.setField('client_id', clientId)
      this.logger.info(`已生成 CLIENT_ID: ${clientId}`)
    }
  }

  private getField(field: NetworkStringField, fallback = ''): string {
    return this.db.getNetworkConfig()?.[field] || fallback
  }

  private setField(field: NetworkStringField, value: string): void {
    this.db.updateNetworkConfig(field, value)
  }

  async initializeDeviceIdAsync(): Promise<void> {
    const macAddress = getDeviceFingerprint().getMacAddressFromEfuse()
    if (!this.getDeviceId().trim() && macAddress) {
      this.setField('device_id', macAddress)
      this.logger.info(`已回填默认 DEVICE_ID: ${macAddress}`)
    }
  }

  getAll(): Record<string, unknown> {
    return this.db.getAllConfig()
  }

  getClientId(): string {
    return this.getField('client_id')
  }

  getDeviceId(): string {
    return this.getField('device_id')
  }

  getOtaVersionUrl(): string {
    return this.getField('ota_version_url', DEFAULT_NETWORK_CONFIG.OTA_VERSION_URL)
  }

  getActivationVersion(): string {
    return this.getField('activation_version', DEFAULT_NETWORK_CONFIG.ACTIVATION_VERSION)
  }

  getAuthorizationUrl(): string {
    return this.getField('authorization_url', DEFAULT_NETWORK_CONFIG.AUTHORIZATION_URL)
  }

  getWebsocketUrl(): string {
    return this.getField('websocket_url')
  }

  setWebsocketUrl(value: string): void {
    this.setField('websocket_url', value)
  }

  getWebsocketAccessToken(): string {
    return this.getField('websocket_access_token')
  }

  setWebsocketAccessToken(value: string): void {
    this.setField('websocket_access_token', value)
  }

  getMqttInfo(): MqttInfo | null {
    const config = this.db.getNetworkConfig()
    if (!config?.mqtt_endpoint)
      return null

    return {
      endpoint: config.mqtt_endpoint,
      client_id: config.mqtt_client_id,
      username: config.mqtt_username,
      password: config.mqtt_password,
      publish_topic: config.mqtt_publish_topic,
      subscribe_topic: config.mqtt_subscribe_topic,
    }
  }

  setMqttInfo(value: MqttInfo | null): void {
    if (!value)
      return
    this.db.updateNetworkConfigBatch({
      mqtt_endpoint: value.endpoint || null,
      mqtt_client_id: value.client_id || null,
      mqtt_username: value.username || null,
      mqtt_password: value.password || null,
      mqtt_publish_topic: value.publish_topic || null,
      mqtt_subscribe_topic: value.subscribe_topic || null,
    })
  }

  updateBatch(updates: Record<string, string | null>): void {
    this.db.updateNetworkConfigBatch(updates)
  }
}
