/**
 * Pets (精灵宠物管理) API 模块
 */
import type { FileDialogResult, PetInfo, PetSpritesheetPayload } from '@shared/types'
import type { IpcRendererEvent } from 'electron'
import { PET_DISPLAY_WIDTH_DEFAULT } from '@shared/types'
import { ipcRenderer } from 'electron'
import { assertIpcSuccess, unwrapIpcResult } from '../utils/ipc'

export type { PetInfo, PetSpritesheetPayload }

export const petsApi = {
  // 获取宠物列表
  getList: async (): Promise<PetInfo[]> => {
    const result: unknown = await ipcRenderer.invoke('pets:get-list')
    return unwrapIpcResult<PetInfo[]>(result, '获取宠物列表失败') ?? []
  },

  // 获取当前宠物
  getCurrent: async (): Promise<string> => {
    const result: unknown = await ipcRenderer.invoke('pets:get-current')
    return unwrapIpcResult<string>(result, '获取当前宠物失败') ?? ''
  },

  // 设置当前宠物
  setCurrent: async (petId: string): Promise<void> => {
    const result: unknown = await ipcRenderer.invoke('pets:set-current', petId)
    assertIpcSuccess(result, '切换宠物失败')
  },

  // 打开文件夹选择器
  selectFolder: async (): Promise<FileDialogResult> => {
    const result: unknown = await ipcRenderer.invoke('pets:select-folder')
    return unwrapIpcResult(result, '选择宠物文件夹失败')
  },

  // 导入宠物（标准 IpcResult：`{ success, data: { petId } }`）
  import: async (sourcePath: string): Promise<string | undefined> => {
    const result: unknown = await ipcRenderer.invoke('pets:import', sourcePath)
    const data = unwrapIpcResult<{ petId?: string }>(result, '导入宠物失败')
    return data?.petId
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
  getFolderPath: async (): Promise<string> => {
    const result: unknown = await ipcRenderer.invoke('pets:get-folder-path')
    return unwrapIpcResult<string>(result, '获取宠物目录路径失败') ?? ''
  },

  // 获取精灵图 dataUrl + 版本 + 像素尺寸（Codex v1/v2）
  getSpritesheet: async (petId: string): Promise<PetSpritesheetPayload | null> => {
    const result: unknown = await ipcRenderer.invoke('pets:get-spritesheet', petId)
    return unwrapIpcResult<PetSpritesheetPayload | null>(result, '获取精灵图失败') ?? null
  },

  // 全局显示宽度（CSS px，80–224，默认 112）
  getDisplayWidth: async (): Promise<number> => {
    const result: unknown = await ipcRenderer.invoke('pets:get-display-size')
    return unwrapIpcResult<number>(result, '获取宠物大小失败') ?? PET_DISPLAY_WIDTH_DEFAULT
  },

  // 设置全局显示宽度；主进程会广播 pets:display-size-changed
  setDisplayWidth: async (width: number): Promise<number> => {
    const result: unknown = await ipcRenderer.invoke('pets:set-display-size', width)
    return unwrapIpcResult<number>(result, '设置宠物大小失败') ?? PET_DISPLAY_WIDTH_DEFAULT
  },

  // 监听宠物切换事件
  onChanged: (callback: (petId: string) => void): () => void => {
    const handler = (_event: IpcRendererEvent, petId: string) => {
      callback(petId)
    }
    ipcRenderer.on('pets:changed', handler)
    return () => ipcRenderer.off('pets:changed', handler)
  },

  // 监听显示宽度变更（设置页 / 其它窗实时同步）
  onDisplayWidthChanged: (callback: (width: number) => void): () => void => {
    const handler = (_event: IpcRendererEvent, width: number) => {
      callback(width)
    }
    ipcRenderer.on('pets:display-size-changed', handler)
    return () => ipcRenderer.off('pets:display-size-changed', handler)
  },
}
