import { getServiceContainer } from '../core/ServiceContainer'
import { getActivationService } from '../services/ActivationService'
import { getConfigManager } from '../services/configManagerDB'
import { getLogger } from '../utils/logger'
import { createIpcHandler, success } from './middleware'

const logger = getLogger('ConfigIpc')

const CONNECTION_KEYS = [
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
] as const

const WRITABLE_STRING_KEYS = [
  'client_id',
  'device_id',
  'ota_version_url',
  'websocket_url',
  'websocket_access_token',
  'activation_version',
  'authorization_url',
] as const

const MQTT_KEYS = [
  'mqtt_endpoint',
  'mqtt_client_id',
  'mqtt_username',
  'mqtt_password',
  'mqtt_publish_topic',
  'mqtt_subscribe_topic',
] as const

/**
 * 注册系统网络配置相关的 IPC 通道
 */
export function registerConfigIpc(): void {
  const configManager = getConfigManager()

  createIpcHandler({
    channel: 'config:get-all',
    handler: () => {
      const config = configManager.getAll()
      logger.info('获取所有配置', config)
      return success(config)
    },
  })

  createIpcHandler({
    channel: 'config:update-all',
    schema: {
      config: { type: 'object', required: true },
    },
    handler: async (_event, configUnknown: unknown) => {
      const config = configUnknown as Record<string, string | undefined>
      logger.info('批量更新配置', config)

      const currentConfig = configManager.getAll()
      const needsReconnect = CONNECTION_KEYS.some(
        key => config[key] !== undefined && config[key] !== (currentConfig[key] ?? ''),
      )

      const updates: Record<string, string | null> = {}
      for (const key of WRITABLE_STRING_KEYS) {
        if (config[key] !== undefined)
          updates[key] = config[key]
      }
      if (config.mqtt_endpoint !== undefined) {
        for (const key of MQTT_KEYS) {
          updates[key] = config[key] ?? null
        }
      }

      configManager.updateBatch(updates)
      logger.info('配置更新成功')

      if (needsReconnect) {
        logger.info('检测到连接相关配置变更，断开旧连接并刷新 OTA/MQTT 配置')
        const activationService = getActivationService()
        activationService.cancelActivation()

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

        // checkActivationStatus 内部调用 fetchOtaConfig 刷新 MQTT 配置到 DB
        const result = await activationService.checkActivationStatus()
        logger.info('激活状态检查完成', result.message)

        container.protocolManager.reloadConfig()
      }

      return success()
    },
  })
}
