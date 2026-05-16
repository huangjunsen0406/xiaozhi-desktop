/**
 * Music Config API - 音乐配置相关功能
 */
import type { IpcResult, MusicConfig } from '@shared/types'
import { ipcRenderer } from 'electron'
import { unwrapIpcResult } from '../utils/ipc'

export type { MusicConfig }

export const musicConfigApi = {
  /**
   * 获取音乐配置
   */
  async getConfig(): Promise<MusicConfig> {
    const result = await ipcRenderer.invoke('music:get-config') as IpcResult<MusicConfig>
    return unwrapIpcResult<MusicConfig>(result, '获取音乐配置失败')
  },

  /**
   * 更新音乐配置
   */
  async updateConfig(config: Partial<MusicConfig>): Promise<void> {
    const result = await ipcRenderer.invoke('music:update-config', config) as IpcResult<void>
    unwrapIpcResult(result, '更新音乐配置失败')
  },
}
