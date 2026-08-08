/**
 * 产品分析 IPC
 * 通道：analytics:*
 */

import {
  getAnalyticsStatus,
  setAnalyticsEnabled,
} from '../services/AnalyticsService'
import { getLogger } from '../utils/logger'
import { createIpcHandler, success } from './middleware'

const logger = getLogger('AnalyticsIpc')

export function registerAnalyticsIpc(): void {
  createIpcHandler({
    channel: 'analytics:get-status',
    handler: async () => success(getAnalyticsStatus()),
  })

  createIpcHandler({
    channel: 'analytics:set-enabled',
    schema: {
      enabled: { type: 'boolean', required: true },
    },
    handler: async (_e, enabled: unknown) => {
      const next = setAnalyticsEnabled(Boolean(enabled))
      logger.info(`分析开关: ${next ? 'on' : 'off'}`)
      return success(getAnalyticsStatus())
    },
  })

  logger.info('Analytics IPC 已注册')
}
