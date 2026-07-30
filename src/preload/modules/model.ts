import type { ModelInfo } from '@shared/types'
/**
 * Model (模型管理) API 模块
 */
import type { IpcRendererEvent } from 'electron'
import { ipcRenderer } from 'electron'
import { assertIpcSuccess, unwrapIpcResult } from '../utils/ipc'

export type { ModelInfo }

export const modelApi = {
  // 获取模型列表
  getList: async (): Promise<ModelInfo[]> => {
    const result: unknown = await ipcRenderer.invoke('model:get-list')
    return unwrapIpcResult<ModelInfo[]>(result, '获取模型列表失败') ?? []
  },

  // 获取当前模型
  getCurrent: async (): Promise<string> => {
    const result: unknown = await ipcRenderer.invoke('model:get-current')
    return unwrapIpcResult<string>(result, '获取当前模型失败') ?? ''
  },

  // 切换模型
  setCurrent: async (modelId: string): Promise<void> => {
    const result: unknown = await ipcRenderer.invoke('model:set-current', modelId)
    assertIpcSuccess(result, '切换模型失败')
  },

  // 打开文件夹选择器
  selectFolder: async (): Promise<Electron.OpenDialogReturnValue> => {
    const result: unknown = await ipcRenderer.invoke('model:select-folder')
    return unwrapIpcResult(result, '选择模型文件夹失败')
  },

  // 导入模型（标准 IpcResult：`{ success, data: { modelId } }`）
  import: async (sourcePath: string): Promise<string | undefined> => {
    const result: unknown = await ipcRenderer.invoke('model:import', sourcePath)
    const data = unwrapIpcResult<{ modelId?: string }>(result, '导入模型失败')
    return data?.modelId
  },

  // 删除模型
  delete: async (modelId: string): Promise<void> => {
    const result: unknown = await ipcRenderer.invoke('model:delete', modelId)
    assertIpcSuccess(result, '删除模型失败')
  },

  // 打开模型目录
  openFolder: async (): Promise<void> => {
    const result: unknown = await ipcRenderer.invoke('model:open-folder')
    assertIpcSuccess(result, '打开模型目录失败')
  },

  // 获取模型目录路径
  getFolderPath: async (): Promise<string> => {
    const result: unknown = await ipcRenderer.invoke('model:get-folder-path')
    return unwrapIpcResult<string>(result, '获取模型目录路径失败')
  },

  // 监听模型切换事件
  onChanged: (callback: (modelId: string) => void): () => void => {
    const handler = (_event: IpcRendererEvent, modelId: string) => {
      callback(modelId)
    }
    ipcRenderer.on('model:changed', handler)
    return () => ipcRenderer.off('model:changed', handler)
  },
}
