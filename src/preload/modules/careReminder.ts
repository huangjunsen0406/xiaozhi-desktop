/**
 * 关怀提醒配置 API（设置页）
 */
import type { CareReminderConfig, CareReminderDemoResult } from '@shared/types'
import { ipcRenderer } from 'electron'
import { unwrapIpcResult } from '../utils/ipc'

export type { CareReminderConfig, CareReminderDemoResult }

export const careReminderApi = {
  async getConfig(): Promise<CareReminderConfig> {
    const result: unknown = await ipcRenderer.invoke('care-reminder:get-config')
    return unwrapIpcResult<CareReminderConfig>(result, '获取关怀提醒配置失败')
  },

  async updateConfig(config: Partial<CareReminderConfig>): Promise<CareReminderConfig> {
    const result: unknown = await ipcRenderer.invoke('care-reminder:update-config', config)
    return unwrapIpcResult<CareReminderConfig>(result, '更新关怀提醒配置失败')
  },

  /**
   * 演示一轮：依次展示四类提醒文案（各约 5 秒），绕过正式调度约束
   */
  async demo(): Promise<CareReminderDemoResult> {
    const result: unknown = await ipcRenderer.invoke('care-reminder:demo')
    return unwrapIpcResult<CareReminderDemoResult>(result, '启动关怀提醒演示失败')
  },
}
