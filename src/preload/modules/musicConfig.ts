import type { MusicConfig } from '@shared/types'
import { invokeData, invokeVoid } from '../utils/ipc'

export const musicConfigApi = {
  getConfig: (): Promise<MusicConfig> =>
    invokeData('music:get-config', '获取音乐配置失败'),

  updateConfig: (config: Partial<MusicConfig>): Promise<void> =>
    invokeVoid('music:update-config', '更新音乐配置失败', config),
}
