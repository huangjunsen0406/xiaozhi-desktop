/**
 * 产品分析 API（preload）
 */
import type { AnalyticsStatus } from '@shared/types'
import { ipcRenderer } from 'electron'
import { unwrapIpcResult } from '../utils/ipc'

export const analyticsApi = {
  getStatus: async (): Promise<AnalyticsStatus> => {
    const result: unknown = await ipcRenderer.invoke('analytics:get-status')
    return unwrapIpcResult<AnalyticsStatus>(result, '获取分析状态失败')
  },

  setEnabled: async (enabled: boolean): Promise<AnalyticsStatus> => {
    const result: unknown = await ipcRenderer.invoke('analytics:set-enabled', enabled)
    return unwrapIpcResult<AnalyticsStatus>(result, '设置分析开关失败')
  },
}
