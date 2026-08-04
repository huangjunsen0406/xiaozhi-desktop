/**
 * 关怀提醒配置 IPC（createIpcHandler + IpcResult）
 */
import type { CareReminderConfig } from '@shared/types'
import {
  getCareReminderConfig,
  startDemoRound,
  updateCareReminderConfig,
} from '../services/CareReminderService'
import { getLogger } from '../utils/logger'
import { createIpcHandler, success } from './middleware'

const logger = getLogger('CareReminderIpc')

function isOptionalBoolean(value: unknown): boolean | string {
  if (value === undefined)
    return true
  return typeof value === 'boolean' ? true : '必须是 boolean'
}

export function registerCareReminderIpc(): void {
  createIpcHandler({
    channel: 'care-reminder:get-config',
    handler: async () => {
      const config = await getCareReminderConfig()
      return success(config)
    },
  })

  createIpcHandler({
    channel: 'care-reminder:update-config',
    schema: {
      updates: {
        type: 'object',
        required: true,
        custom: (value) => {
          if (value == null || typeof value !== 'object' || Array.isArray(value))
            return 'updates 必须是对象'
          const obj = value as Record<string, unknown>
          const keys = ['enabled', 'water', 'walk', 'eyes', 'sleep'] as const
          for (const key of keys) {
            if (key in obj) {
              const ok = isOptionalBoolean(obj[key])
              if (ok !== true)
                return `${key} ${ok}`
            }
          }
          return true
        },
      },
    },
    handler: async (_event, updatesUnknown: unknown) => {
      const updates = updatesUnknown as Partial<CareReminderConfig>
      const next = await updateCareReminderConfig(updates)
      logger.info('关怀提醒配置 IPC 更新完成')
      return success(next)
    },
  })

  createIpcHandler({
    channel: 'care-reminder:demo',
    handler: async () => {
      const result = startDemoRound()
      logger.info('关怀提醒演示 IPC', result)
      return success(result)
    },
  })

  logger.info('关怀提醒 IPC 已注册')
}
