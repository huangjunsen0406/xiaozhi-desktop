import { invokeData, subscribeChannel } from '../utils/ipc'

export const themeApi = {
  onThemeChange: (callback: (theme: string) => void): (() => void) =>
    subscribeChannel('theme:set', callback),

  getCurrentTheme: async (): Promise<string> =>
    (await invokeData<string>('theme:get', '获取主题失败')) ?? 'auto',
}
