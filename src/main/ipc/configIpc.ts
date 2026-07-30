import type { MqttInfo } from '../services/configManagerDB'
import axios from 'axios'
import { getServiceContainer } from '../core/ServiceContainer'
import { getActivationService } from '../services/ActivationService'
import { getConfigManager } from '../services/configManagerDB'
import { getLogger } from '../utils/logger'
import { createIpcHandler, failure, success } from './middleware'

const logger = getLogger('ConfigIpc')

/**
 * 注册配置相关的 IPC 通道（createIpcHandler + IpcResult）
 */
export function registerConfigIpc(): void {
  const configManager = getConfigManager()

  /**
   * 获取所有配置
   */
  createIpcHandler({
    channel: 'config:get-all',
    handler: () => {
      const config = configManager.getAll()
      logger.info('获取所有配置', config)
      return success(config)
    },
  })

  /**
   * 获取单个配置值
   */
  createIpcHandler({
    channel: 'config:get',
    schema: {
      key: { type: 'string', required: true, minLength: 1 },
    },
    handler: (_event, keyUnknown: unknown) => {
      const key = String(keyUnknown)
      let value: string | null | MqttInfo = null
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
      return success(value)
    },
  })

  /**
   * 设置单个配置值
   */
  createIpcHandler({
    channel: 'config:set',
    schema: {
      key: { type: 'string', required: true, minLength: 1 },
    },
    handler: (_event, keyUnknown: unknown, value: unknown) => {
      const key = String(keyUnknown)
      let ok = false
      switch (key) {
        case 'client_id':
          ok = configManager.setClientId(value as string)
          break
        case 'device_id':
          ok = configManager.setDeviceId(value as string)
          break
        case 'ota_version_url':
          ok = configManager.setOtaVersionUrl(value as string)
          break
        case 'websocket_url':
          ok = configManager.setWebsocketUrl(value as string)
          break
        case 'websocket_access_token':
          ok = configManager.setWebsocketAccessToken(value as string)
          break
        case 'mqtt_info':
          ok = configManager.setMqttInfo(value as MqttInfo | null)
          break
        case 'activation_version':
          ok = configManager.setActivationVersion(value as string)
          break
        case 'authorization_url':
          ok = configManager.setAuthorizationUrl(value as string)
          break
        default:
          return failure(`未知配置项: ${key}`)
      }
      logger.info(`设置配置 ${key}`, { value, success: ok })
      if (!ok) {
        return failure(`设置配置 ${key} 失败`)
      }
      return success()
    },
  })

  /**
   * 批量更新配置
   */
  createIpcHandler({
    channel: 'config:update-all',
    schema: {
      config: { type: 'object', required: true },
    },
    handler: async (_event, configUnknown: unknown) => {
      const config = configUnknown as Record<string, string | undefined>
      logger.info('批量更新配置', config)

      // 连接相关的字段列表
      const connectionKeys = [
        'ota_version_url',
        'device_id',
        'websocket_url',
        'websocket_access_token',
        'mqtt_endpoint',
        'mqtt_client_id',
        'mqtt_username',
        'mqtt_password',
        'mqtt_publish_topic',
        'mqtt_subscribe_topic',
        'authorization_url',
      ]

      // 检查是否修改了 OTA URL
      const otaUrlChanged = config.ota_version_url !== undefined
        && config.ota_version_url !== configManager.getOtaVersionUrl()

      // 获取修改前的配置，用于比较是否真正发生了变化
      const currentConfig = configManager.getAll() as Record<string, unknown>

      // 检查是否有任何连接相关字段的值实际发生了变化
      const needsReconnect = connectionKeys.some(
        key => config[key] !== undefined && config[key] !== (currentConfig[key] ?? ''),
      )

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

      // 如果有连接相关字段被修改，触发 OTA 刷新 + 激活检查 + 协议重连
      if (needsReconnect) {
        logger.info('检测到连接相关配置变更，触发刷新和重连')

        // 如果 OTA URL 被修改，重新获取 OTA 配置
        if (otaUrlChanged) {
          logger.info('OTA URL 已修改，触发刷新配置')
          try {
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
                }
              }
            }
          }
          catch (refreshError) {
            logger.error('刷新 OTA 配置失败', refreshError)
            // 不影响后续激活检查和重连
          }
        }

        // 取消进行中的激活重试
        const activationService = getActivationService()
        activationService.cancelActivation()

        // 系统网络/端点变更：断开旧连接并 reload 协议配置。
        // 与音频编解码/MCP 的 reconnectIfConnectedKeepingIdle 不同——
        // 此处不自动 idle 重连（OTA/激活流程可能改 token；由用户下次唤醒再建连）。
        const container = getServiceContainer()
        try {
          if (container.protocolManager.isAudioChannelOpened()) {
            await container.protocolManager.closeAudioChannel()
            logger.info('旧协议连接已断开')
          }
        }
        catch (disconnectError) {
          logger.error('断开旧连接失败', disconnectError)
        }

        // 激活状态检查（内部调用 fetchOtaConfig 刷新 MQTT/WS 配置到 DB）
        try {
          const result = await activationService.checkActivationStatus()
          logger.info('激活状态检查完成', result.message)
        }
        catch (activationError) {
          logger.error('激活状态检查失败', activationError)
        }

        // 刷新协议内存配置（下次连接时使用新配置）
        container.protocolManager.reloadConfig()
      }

      return success()
    },
  })

  logger.info('配置相关 IPC 通道已注册')
}
