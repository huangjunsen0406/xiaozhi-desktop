/**
 * Emotion (表情) API 模块
 */
import { ipcRenderer } from 'electron'

export const emotionApi = {
  // 打开文件选择器
  selectImage: (): Promise<Electron.OpenDialogReturnValue> =>
    ipcRenderer.invoke('emotion:select-image'),

  // 上传自定义表情
  uploadCustom: (emotionType: string, sourcePath: string): Promise<{ success: boolean, error?: string }> =>
    ipcRenderer.invoke('emotion:upload-custom', emotionType, sourcePath),

  // 获取映射配置
  getMapping: (): Promise<Record<string, string>> =>
    ipcRenderer.invoke('emotion:get-mapping'),

  // 获取自定义图片路径
  getCustomPath: (emotionType: string): Promise<string | null> =>
    ipcRenderer.invoke('emotion:get-custom-path', emotionType),

  // 重置表情（删除自定义）
  reset: (emotionType: string): Promise<{ success: boolean, error?: string }> =>
    ipcRenderer.invoke('emotion:reset', emotionType),

  // 监听表情变更事件
  onEmotionChanged: (callback: (emotionType: string) => void): void => {
    ipcRenderer.on('emotion:changed', (_event, emotionType) => callback(emotionType))
  },

  // 移除表情变更监听器
  removeEmotionChangedListener: (): void => {
    ipcRenderer.removeAllListeners('emotion:changed')
  },
}
