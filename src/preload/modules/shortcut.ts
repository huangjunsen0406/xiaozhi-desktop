import type { ShortcutConfig } from '@shared/types'
import { invokeData, invokeVoid } from '../utils/ipc'

export const shortcutApi = {
  getAll: (): Promise<ShortcutConfig[]> =>
    invokeData('shortcut:get-all', '获取快捷键配置失败'),

  update: (action: string, accelerator: string | null): Promise<void> =>
    invokeVoid('shortcut:update', '更新快捷键失败', action, accelerator),

  checkConflict: async (accelerator: string, excludeAction?: string) => {
    const data = await invokeData<{ conflict: boolean, name?: string | null }>(
      'shortcut:check-conflict',
      '检测快捷键冲突失败',
      accelerator,
      excludeAction,
    )
    return { conflict: data.conflict, name: data.name ?? null }
  },

  reset: (): Promise<void> =>
    invokeVoid('shortcut:reset', '重置快捷键失败'),
}
