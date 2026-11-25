import { invokeData, invokeVoid } from '../utils/ipc'

export const clipboardApi = {
  writeText: (text: string): Promise<void> =>
    invokeVoid('clipboard:write-text', '复制到剪贴板失败', text),

  readText: async (): Promise<string> =>
    (await invokeData<string | undefined>('clipboard:read-text', '从剪贴板读取失败')) ?? '',
}
