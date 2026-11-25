import type { WakeWordConfig } from '@shared/types'
import { invokeData, invokeVoid } from '../utils/ipc'

export const wakeWordApi = {
  getConfig: (): Promise<WakeWordConfig> =>
    invokeData('wake-word:get-config', '获取唤醒词配置失败'),

  updateConfig: (updates: Partial<WakeWordConfig>): Promise<void> =>
    invokeVoid('wake-word:update-config', '更新唤醒词配置失败', updates),

  test: async (): Promise<string | undefined> => {
    const data = await invokeData<{ keyword?: string }>('wake-word:test', '测试唤醒词失败')
    return data?.keyword
  },
}
