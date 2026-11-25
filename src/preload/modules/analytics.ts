import type { AnalyticsStatus } from '@shared/types'
import { invokeData } from '../utils/ipc'

export const analyticsApi = {
  getStatus: (): Promise<AnalyticsStatus> =>
    invokeData('analytics:get-status', '获取分析状态失败'),

  setEnabled: (enabled: boolean): Promise<AnalyticsStatus> =>
    invokeData('analytics:set-enabled', '设置分析开关失败', enabled),
}
