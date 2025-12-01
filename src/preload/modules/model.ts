/**
 * Model (模型管理) API 模块
 */
import type { IpcRendererEvent } from 'electron'
import { ipcRenderer } from 'electron'

/**
 * 模型信息接口
 */
export interface ModelInfo {
  id: string
  name: string
  path: string
  preview?: string
  hasExpressions: boolean
  hasMotions: boolean
  expressionCount: number
  motionCount: number
}

// 模型切换监听器
let modelChangedListener: ((_event: IpcRendererEvent, modelId: string) => void) | null = null

export const modelApi = {
  // 获取模型列表
  getList: (): Promise<ModelInfo[]> =>
    ipcRenderer.invoke('model:get-list'),

  // 获取当前模型
  getCurrent: (): Promise<string> =>
    ipcRenderer.invoke('model:get-current'),

  // 切换模型
  setCurrent: (modelId: string): Promise<{ success: boolean, error?: string }> =>
    ipcRenderer.invoke('model:set-current', modelId),

  // 打开文件夹选择器
  selectFolder: (): Promise<Electron.OpenDialogReturnValue> =>
    ipcRenderer.invoke('model:select-folder'),

  // 导入模型
  import: (sourcePath: string): Promise<{ success: boolean, error?: string, modelId?: string }> =>
    ipcRenderer.invoke('model:import', sourcePath),

  // 删除模型
  delete: (modelId: string): Promise<{ success: boolean, error?: string }> =>
    ipcRenderer.invoke('model:delete', modelId),

  // 打开模型目录
  openFolder: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('model:open-folder'),

  // 获取模型目录路径
  getFolderPath: (): Promise<string> =>
    ipcRenderer.invoke('model:get-folder-path'),

  // 监听模型切换事件
  onChanged: (callback: (modelId: string) => void): void => {
    // 移除旧的监听器
    if (modelChangedListener) {
      ipcRenderer.removeListener('model:changed', modelChangedListener)
    }
    // 设置新的监听器
    modelChangedListener = (_event: IpcRendererEvent, modelId: string) => {
      callback(modelId)
    }
    ipcRenderer.on('model:changed', modelChangedListener)
  },

  // 移除模型切换监听
  removeChangedListener: (): void => {
    if (modelChangedListener) {
      ipcRenderer.removeListener('model:changed', modelChangedListener)
      modelChangedListener = null
    }
  },
}
