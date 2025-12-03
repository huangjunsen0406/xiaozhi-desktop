import type { MqttInfo } from '../services/configManagerDB'
import { ipcMain } from 'electron'
import { getConfigManager } from '../services/configManagerDB'
import { getLogger } from '../utils/logger'

const logger = getLogger('ConfigIpc')

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
  ipcMain.handle('config:update-all', async (_, config: Record<string, string | undefined>) => {
    try {
      logger.info('批量更新配置', config)

      // 检查是否修改了 OTA URL
      const otaUrlChanged = config.ota_version_url !== undefined
        && config.ota_version_url !== configManager.getOtaVersionUrl()

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

      // 如果 OTA URL 被修改，触发刷新
      if (otaUrlChanged) {
        logger.info('OTA URL 已修改，触发刷新配置')
        try {
          const { getActivationService } = await import('../services/ActivationService')
          const activationService = getActivationService()

          // 重新获取 OTA 配置
          const deviceFingerprint = activationService.getDeviceFingerprint()
          if (deviceFingerprint) {
            const otaUrl = configManager.getOtaVersionUrl()
            const deviceId = configManager.getDeviceId()
            const clientId = configManager.getClientId()
            const activationVersion = configManager.getActivationVersion()

            if (otaUrl && deviceId) {
              const headers: Record<string, string> = {
                'Device-Id': deviceId,
                'Client-Id': clientId || '',
                'Content-Type': 'application/json',
                'Accept-Language': 'zh-CN',
              }

              if (activationVersion === 'v2') {
                headers['Activation-Version'] = '2'
              }

              const hmacKey = deviceFingerprint.getHmacKey()
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

              logger.info(`请求 OTA 配置: ${otaUrl}`)
              const axios = (await import('axios')).default
              const response = await axios.post(otaUrl, payload, {
                headers,
                timeout: 10000,
              })

              if (response.status === 200 && response.data) {
                const data = response.data

                // 更新 MQTT 配置
                if (data.mqtt) {
                  configManager.setMqttInfo(data.mqtt)
                  logger.info('MQTT 配置已刷新')
                }

                // 更新 WebSocket 配置
                if (data.websocket) {
                  if (data.websocket.url) {
                    configManager.setWebsocketUrl(data.websocket.url)
                    logger.info(`WebSocket URL 已刷新: ${data.websocket.url}`)
                  }
                  if (data.websocket.token) {
                    configManager.setWebsocketAccessToken(data.websocket.token)
                    logger.info('WebSocket Token 已刷新')
                  }
                }

                logger.info('OTA 配置刷新成功')

                // 刷新协议配置，让新的 WebSocket/MQTT 配置生效
                try {
                  const { getApplication } = await import('../services/Application')
                  const application = getApplication()
                  application.reloadProtocolConfig()
                  logger.info('协议配置已刷新')
                }
                catch (reloadError) {
                  logger.error('刷新协议配置失败', reloadError)
                }
              }
            }
          }
        }
        catch (refreshError) {
          logger.error('刷新 OTA 配置失败', refreshError)
          // 不影响配置保存，只记录错误
        }
      }

      return { success: true }
    }
    catch (error) {
      logger.error('批量更新配置失败', error)
      return { success: false, error: String(error) }
    }
  })

  logger.info('配置相关 IPC 通道已注册')
}
