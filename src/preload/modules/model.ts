import type { FileDialogResult, ModelInfo } from '@shared/types'
import { invokeData, invokeVoid, subscribeChannel } from '../utils/ipc'

export const modelApi = {
  getList: async (): Promise<ModelInfo[]> =>
    (await invokeData<ModelInfo[] | undefined>('model:get-list', '获取模型列表失败')) ?? [],

  getCurrent: async (): Promise<string> =>
    (await invokeData<string | undefined>('model:get-current', '获取当前模型失败')) ?? '',

  setCurrent: (modelId: string): Promise<void> =>
    invokeVoid('model:set-current', '切换模型失败', modelId),

  selectFolder: (): Promise<FileDialogResult> =>
    invokeData('model:select-folder', '选择模型文件夹失败'),

  import: async (sourcePath: string): Promise<string | undefined> => {
    const data = await invokeData<{ modelId?: string }>('model:import', '导入模型失败', sourcePath)
    return data?.modelId
  },

  delete: (modelId: string): Promise<void> =>
    invokeVoid('model:delete', '删除模型失败', modelId),

  openFolder: (): Promise<void> =>
    invokeVoid('model:open-folder', '打开模型目录失败'),

  getFolderPath: (): Promise<string> =>
    invokeData('model:get-folder-path', '获取模型目录路径失败'),

  onChanged: (callback: (modelId: string) => void): () => void =>
    subscribeChannel('model:changed', callback),
}
