/**
 * Music Config API - 音乐配置相关功能
 */
import type { MusicConfig } from '@shared/types'
import { ipcRenderer } from 'electron'
import { unwrapIpcResult } from '../utils/ipc'

export type { MusicConfig }

export const musicConfigApi = {
  /**
   * 获取音乐配置
   */
  async getConfig(): Promise<MusicConfig> {
    const result: unknown = await ipcRenderer.invoke('music:get-config')
    return unwrapIpcResult<MusicConfig>(result, '获取音乐配置失败')
  },

  /**
   * 更新音乐配置
   */
  async updateConfig(config: Partial<MusicConfig>): Promise<void> {
    const result: unknown = await ipcRenderer.invoke('music:update-config', config)
    unwrapIpcResult(result, '更新音乐配置失败')
  },
}
