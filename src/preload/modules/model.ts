import type { ModelInfo } from '@shared/types'
/**
 * Model (模型管理) API 模块
 */
import type { IpcRendererEvent } from 'electron'
import { ipcRenderer } from 'electron'
import { assertIpcSuccess } from '../utils/ipc'

export type { ModelInfo }

export const modelApi = {
  // 获取模型列表
  getList: (): Promise<ModelInfo[]> =>
    ipcRenderer.invoke('model:get-list'),

  // 获取当前模型
  getCurrent: (): Promise<string> =>
    ipcRenderer.invoke('model:get-current'),

  // 切换模型
  setCurrent: async (modelId: string): Promise<void> => {
    const result = await ipcRenderer.invoke('model:set-current', modelId) as { success: boolean, error?: string }
    assertIpcSuccess(result, '切换模型失败')
  },

  // 打开文件夹选择器
  selectFolder: (): Promise<Electron.OpenDialogReturnValue> =>
    ipcRenderer.invoke('model:select-folder'),

  // 导入模型
  import: async (sourcePath: string): Promise<string | undefined> => {
    const result = await ipcRenderer.invoke('model:import', sourcePath) as { success: boolean, error?: string, modelId?: string }
    assertIpcSuccess(result, '导入模型失败')
    return result.modelId
  },

  // 删除模型
  delete: async (modelId: string): Promise<void> => {
    const result = await ipcRenderer.invoke('model:delete', modelId) as { success: boolean, error?: string }
    assertIpcSuccess(result, '删除模型失败')
  },

  // 打开模型目录
  openFolder: async (): Promise<void> => {
    const result = await ipcRenderer.invoke('model:open-folder') as { success: boolean, error?: string }
    assertIpcSuccess(result, '打开模型目录失败')
  },

  // 获取模型目录路径
  getFolderPath: (): Promise<string> =>
    ipcRenderer.invoke('model:get-folder-path'),

  // 监听模型切换事件
  onChanged: (callback: (modelId: string) => void): () => void => {
    const handler = (_event: IpcRendererEvent, modelId: string) => {
      callback(modelId)
    }
    ipcRenderer.on('model:changed', handler)
    return () => ipcRenderer.off('model:changed', handler)
  },
}
