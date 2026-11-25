import type { FileDialogResult } from '@shared/types'
import { invokeData, invokeVoid, subscribeChannel } from '../utils/ipc'

export const emotionApi = {
  selectImage: (): Promise<FileDialogResult> =>
    invokeData('emotion:select-image', '选择表情图片失败'),

  uploadCustom: (emotionType: string, sourcePath: string): Promise<void> =>
    invokeVoid('emotion:upload-custom', '上传表情失败', emotionType, sourcePath),

  getMapping: async (): Promise<Record<string, string>> =>
    (await invokeData<Record<string, string> | undefined>('emotion:get-mapping', '获取表情映射失败')) ?? {},

  getCustomPath: async (emotionType: string): Promise<string | null> =>
    (await invokeData<string | null | undefined>('emotion:get-custom-path', '获取自定义表情路径失败', emotionType)) ?? null,

  reset: (emotionType: string): Promise<void> =>
    invokeVoid('emotion:reset', '重置表情失败', emotionType),

  onEmotionChanged: (callback: (emotionType: string) => void): () => void =>
    subscribeChannel('emotion:changed', callback),
}
