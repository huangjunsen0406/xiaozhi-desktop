import type { CareReminderConfig, CareReminderDemoResult } from '@shared/types'
import { invokeData } from '../utils/ipc'

export const careReminderApi = {
  getConfig: (): Promise<CareReminderConfig> =>
    invokeData('care-reminder:get-config', '获取关怀提醒配置失败'),

  updateConfig: (config: Partial<CareReminderConfig>): Promise<CareReminderConfig> =>
    invokeData('care-reminder:update-config', '更新关怀提醒配置失败', config),

  demo: (): Promise<CareReminderDemoResult> =>
    invokeData('care-reminder:demo', '启动关怀提醒演示失败'),
}
