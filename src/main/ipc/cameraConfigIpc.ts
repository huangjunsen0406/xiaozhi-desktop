/**
 * 摄像头配置 IPC 处理（createIpcHandler + IpcResult）
 */
import type { CameraConfig } from '@shared/types'
import type { DbCameraConfigPatch } from '../types/database'
import { getDatabase } from '../services/database'
import { getLogger } from '../utils/logger'
import { createIpcHandler, success } from './middleware'
import { optionalBoolean, optionalNumber, optionalString, parseObject } from './middleware/validation'

const logger = getLogger('CameraConfigIpc')

function parseCameraUpdate(value: unknown): Partial<CameraConfig> {
  const input = parseObject(value)
  return {
    enabled: optionalBoolean(input, 'enabled'),
    deviceId: optionalString(input, 'deviceId'),
    deviceLabel: optionalString(input, 'deviceLabel'),
    useLocalVision: optionalBoolean(input, 'useLocalVision'),
    vlApiKey: optionalString(input, 'vlApiKey'),
    vlUrl: optionalString(input, 'vlUrl'),
    vlModel: optionalString(input, 'vlModel'),
    captureWidth: optionalNumber(input, 'captureWidth', { min: 1, integer: true }),
    captureHeight: optionalNumber(input, 'captureHeight', { min: 1, integer: true }),
    jpegQuality: optionalNumber(input, 'jpegQuality', { min: 1, max: 100, integer: true }),
    maxDimension: optionalNumber(input, 'maxDimension', { min: 1, integer: true }),
  }
}

function cameraUpdateToDb(updates: Partial<CameraConfig>): DbCameraConfigPatch {
  return {
    enabled: updates.enabled,
    device_id: updates.deviceId,
    device_label: updates.deviceLabel,
    use_local_vision: updates.useLocalVision,
    vl_api_key: updates.vlApiKey,
    vl_url: updates.vlUrl,
    vl_model: updates.vlModel,
    capture_width: updates.captureWidth,
    capture_height: updates.captureHeight,
    jpeg_quality: updates.jpegQuality,
    max_dimension: updates.maxDimension,
  }
}

export function registerCameraConfigIpc(): void {
  const db = getDatabase()

  createIpcHandler({
    channel: 'camera-config:get',
    handler: async () => {
      const config = db.getFormattedCameraConfig()
      logger.info('获取配置:', config)
      return success(config)
    },
  })

  createIpcHandler({
    channel: 'camera-config:update',
    schema: {
      updates: { type: 'object', required: true },
    },
    handler: async (_event, updatesUnknown: unknown) => {
      const updates = parseCameraUpdate(updatesUnknown)
      db.updateCameraConfig(cameraUpdateToDb(updates))
      logger.info('配置更新成功')
      return success()
    },
  })

  logger.info('摄像头配置 IPC 注册完成')
}
