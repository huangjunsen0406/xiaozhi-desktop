import type { FileDialogResult, PetInfo, PetSpritesheetPayload } from '@shared/types'
import { PET_DISPLAY_WIDTH_DEFAULT } from '@shared/types'
import { invokeData, invokeVoid, subscribeChannel } from '../utils/ipc'

export const petsApi = {
  getList: async (): Promise<PetInfo[]> =>
    (await invokeData<PetInfo[] | undefined>('pets:get-list', '获取宠物列表失败')) ?? [],

  getCurrent: async (): Promise<string> =>
    (await invokeData<string | undefined>('pets:get-current', '获取当前宠物失败')) ?? '',

  setCurrent: (petId: string): Promise<void> =>
    invokeVoid('pets:set-current', '切换宠物失败', petId),

  selectFolder: (): Promise<FileDialogResult> =>
    invokeData('pets:select-folder', '选择宠物文件夹失败'),

  import: async (sourcePath: string): Promise<string | undefined> => {
    const data = await invokeData<{ petId?: string }>('pets:import', '导入宠物失败', sourcePath)
    return data?.petId
  },

  delete: (petId: string): Promise<void> =>
    invokeVoid('pets:delete', '删除宠物失败', petId),

  openFolder: (): Promise<void> =>
    invokeVoid('pets:open-folder', '打开宠物目录失败'),

  getFolderPath: async (): Promise<string> =>
    (await invokeData<string | undefined>('pets:get-folder-path', '获取宠物目录路径失败')) ?? '',

  getSpritesheet: async (petId: string): Promise<PetSpritesheetPayload | null> =>
    (await invokeData<PetSpritesheetPayload | null | undefined>('pets:get-spritesheet', '获取精灵图失败', petId)) ?? null,

  getDisplayWidth: async (): Promise<number> =>
    (await invokeData<number | undefined>('pets:get-display-size', '获取宠物大小失败')) ?? PET_DISPLAY_WIDTH_DEFAULT,

  setDisplayWidth: async (width: number): Promise<number> =>
    (await invokeData<number | undefined>('pets:set-display-size', '设置宠物大小失败', width)) ?? PET_DISPLAY_WIDTH_DEFAULT,

  onChanged: (callback: (petId: string) => void): () => void =>
    subscribeChannel('pets:changed', callback),

  onDisplayWidthChanged: (callback: (width: number) => void): () => void =>
    subscribeChannel('pets:display-size-changed', callback),
}
