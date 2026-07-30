import type { PetInfo } from '@shared/types'
/**
 * Pets (精灵宠物管理) API 模块
 */
import type { IpcRendererEvent } from 'electron'
import { ipcRenderer } from 'electron'
import { assertIpcSuccess, unwrapIpcSuccessFields } from '../utils/ipc'

export type { PetInfo }

export const petsApi = {
  // 获取宠物列表
  getList: (): Promise<PetInfo[]> =>
    ipcRenderer.invoke('pets:get-list'),

  // 获取当前宠物
  getCurrent: (): Promise<string> =>
    ipcRenderer.invoke('pets:get-current'),

  // 设置当前宠物
  setCurrent: async (petId: string): Promise<void> => {
    const result: unknown = await ipcRenderer.invoke('pets:set-current', petId)
    assertIpcSuccess(result, '切换宠物失败')
  },

  // 打开文件夹选择器
  selectFolder: (): Promise<Electron.OpenDialogReturnValue> =>
    ipcRenderer.invoke('pets:select-folder'),

  // 导入宠物
  import: async (sourcePath: string): Promise<string | undefined> => {
    const result: unknown = await ipcRenderer.invoke('pets:import', sourcePath)
    const data = unwrapIpcSuccessFields<{ success: true, petId?: string }>(
      result,
      '导入宠物失败',
    )
    return data.petId
  },

  // 删除宠物
  delete: async (petId: string): Promise<void> => {
    const result: unknown = await ipcRenderer.invoke('pets:delete', petId)
    assertIpcSuccess(result, '删除宠物失败')
  },

  // 打开宠物目录
  openFolder: async (): Promise<void> => {
    const result: unknown = await ipcRenderer.invoke('pets:open-folder')
    assertIpcSuccess(result, '打开宠物目录失败')
  },

  // 获取宠物目录路径
  getFolderPath: (): Promise<string> =>
    ipcRenderer.invoke('pets:get-folder-path'),

  // 获取精灵图 base64 数据
  getSpritesheet: (petId: string): Promise<string | null> =>
    ipcRenderer.invoke('pets:get-spritesheet', petId),

  // 监听宠物切换事件
  onChanged: (callback: (petId: string) => void): () => void => {
    const handler = (_event: IpcRendererEvent, petId: string) => {
      callback(petId)
    }
    ipcRenderer.on('pets:changed', handler)
    return () => ipcRenderer.off('pets:changed', handler)
  },
}
