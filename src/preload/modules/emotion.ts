/**
 * Emotion (表情) API 模块
 */
import { ipcRenderer } from 'electron'
import { assertIpcSuccess, unwrapIpcResult } from '../utils/ipc'

export const emotionApi = {
  // 打开文件选择器
  selectImage: async (): Promise<Electron.OpenDialogReturnValue> => {
    const result: unknown = await ipcRenderer.invoke('emotion:select-image')
    return unwrapIpcResult(result, '选择表情图片失败')
  },

  // 上传自定义表情
  uploadCustom: async (emotionType: string, sourcePath: string): Promise<void> => {
    const result: unknown = await ipcRenderer.invoke('emotion:upload-custom', emotionType, sourcePath)
    assertIpcSuccess(result, '上传表情失败')
  },

  // 获取映射配置
  getMapping: async (): Promise<Record<string, string>> => {
    const result: unknown = await ipcRenderer.invoke('emotion:get-mapping')
    return unwrapIpcResult<Record<string, string>>(result, '获取表情映射失败') ?? {}
  },

  // 获取自定义图片路径
  getCustomPath: async (emotionType: string): Promise<string | null> => {
    const result: unknown = await ipcRenderer.invoke('emotion:get-custom-path', emotionType)
    return unwrapIpcResult<string | null>(result, '获取自定义表情路径失败') ?? null
  },

  // 重置表情（删除自定义）
  reset: async (emotionType: string): Promise<void> => {
    const result: unknown = await ipcRenderer.invoke('emotion:reset', emotionType)
    assertIpcSuccess(result, '重置表情失败')
  },

  // 监听表情变更事件
  onEmotionChanged: (callback: (emotionType: string) => void): () => void => {
    const handler = (_event: Electron.IpcRendererEvent, emotionType: string) => callback(emotionType)
    ipcRenderer.on('emotion:changed', handler)
    return () => ipcRenderer.off('emotion:changed', handler)
  },
}
