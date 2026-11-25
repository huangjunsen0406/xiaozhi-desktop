import type { SystemConfig } from '@shared/types'
import { invokeData, invokeVoid } from '../utils/ipc'

export const systemApi = {
  getConfig: (): Promise<SystemConfig> =>
    invokeData('config:get-all', '获取系统配置失败'),

  updateConfig: (config: SystemConfig): Promise<void> =>
    invokeVoid('config:update-all', '更新系统配置失败', config),
}
