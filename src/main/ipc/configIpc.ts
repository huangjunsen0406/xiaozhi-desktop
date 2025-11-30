import type { MqttInfo } from '../services/configManagerDB'
import { ipcMain } from 'electron'
import { getConfigManager } from '../services/configManagerDB'
import { createLogger } from '../utils/logger'

const logger = createLogger('ConfigIpc')

/**
 * 注册配置相关的 IPC 通道
 */
export function registerConfigIpc(): void {
  const configManager = getConfigManager()

  /**
   * 获取所有配置
   */
  ipcMain.handle('config:get-all', () => {
    try {
      const config = configManager.getAll()
      logger.info('获取所有配置', config)
      return { success: true, data: config }
    }
    catch (error) {
      logger.error('获取配置失败', error)
      return { success: false, error: String(error) }
    }
  })

  /**
   * 获取单个配置值
   */
  ipcMain.handle('config:get', (_, key: string) => {
    try {
      let value: string | null | MqttInfo = null
      // 根据 key 调用对应的方法
      switch (key) {
        case 'client_id':
          value = configManager.getClientId()
          break
        case 'device_id':
          value = configManager.getDeviceId()
          break
        case 'ota_version_url':
          value = configManager.getOtaVersionUrl()
          break
        case 'websocket_url':
          value = configManager.getWebsocketUrl()
          break
        case 'websocket_access_token':
          value = configManager.getWebsocketAccessToken()
          break
        case 'mqtt_info':
          value = configManager.getMqttInfo()
          break
        case 'activation_version':
          value = configManager.getActivationVersion()
          break
        case 'authorization_url':
          value = configManager.getAuthorizationUrl()
          break
        default:
          value = null
      }
      logger.info(`获取配置 ${key}`, value)
      return { success: true, data: value }
    }
    catch (error) {
      logger.error(`获取配置 ${key} 失败`, error)
      return { success: false, error: String(error) }
    }
  })

  /**
   * 设置单个配置值
   */
  ipcMain.handle('config:set', (_, key: string, value: string | MqttInfo | null) => {
    try {
      let success = false
      // 根据 key 调用对应的方法
      switch (key) {
        case 'client_id':
          success = configManager.setClientId(value as string)
          break
        case 'device_id':
          success = configManager.setDeviceId(value as string)
          break
        case 'ota_version_url':
          success = configManager.setOtaVersionUrl(value as string)
          break
        case 'websocket_url':
          success = configManager.setWebsocketUrl(value as string)
          break
        case 'websocket_access_token':
          success = configManager.setWebsocketAccessToken(value as string)
          break
        case 'mqtt_info':
          success = configManager.setMqttInfo(value as MqttInfo | null)
          break
        case 'activation_version':
          success = configManager.setActivationVersion(value as string)
          break
        case 'authorization_url':
          success = configManager.setAuthorizationUrl(value as string)
          break
        default:
          success = false
      }
      logger.info(`设置配置 ${key}`, { value, success })
      return { success }
    }
    catch (error) {
      logger.error(`设置配置 ${key} 失败`, error)
      return { success: false, error: String(error) }
    }
  })

  /**
   * 批量更新配置
   */
  ipcMain.handle('config:update-all', (_, config: Record<string, string | undefined>) => {
    try {
      logger.info('批量更新配置', config)

      // 直接使用扁平格式更新
      const updates: Record<string, string | null> = {}

      if (config.client_id !== undefined) {
        updates.client_id = config.client_id
      }
      if (config.device_id !== undefined) {
        updates.device_id = config.device_id
      }
      if (config.ota_version_url !== undefined) {
        updates.ota_version_url = config.ota_version_url
      }
      if (config.websocket_url !== undefined) {
        updates.websocket_url = config.websocket_url
      }
      if (config.websocket_access_token !== undefined) {
        updates.websocket_access_token = config.websocket_access_token
      }
      if (config.activation_version !== undefined) {
        updates.activation_version = config.activation_version
      }
      if (config.authorization_url !== undefined) {
        updates.authorization_url = config.authorization_url
      }

      // MQTT 配置需要特殊处理
      if (config.mqtt_endpoint !== undefined) {
        updates.mqtt_endpoint = config.mqtt_endpoint ?? null
        updates.mqtt_client_id = config.mqtt_client_id ?? null
        updates.mqtt_username = config.mqtt_username ?? null
        updates.mqtt_password = config.mqtt_password ?? null
        updates.mqtt_publish_topic = config.mqtt_publish_topic ?? null
        updates.mqtt_subscribe_topic = config.mqtt_subscribe_topic ?? null
      }

      // 批量更新
      configManager.updateBatch(updates)

      logger.info('配置更新成功')
      return { success: true }
    }
    catch (error) {
      logger.error('批量更新配置失败', error)
      return { success: false, error: String(error) }
    }
  })

  logger.info('配置相关 IPC 通道已注册')
}
