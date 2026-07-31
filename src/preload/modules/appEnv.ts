/**
 * 渲染进程只读环境信息
 * 在 preload 侧读取 process，经 contextBridge 暴露为 window.api
 */
import process from 'node:process'

export type AppPlatform = NodeJS.Platform | string

export interface AppProcessVersions {
  electron?: string
  chrome?: string
  node?: string
  [key: string]: string | undefined
}

export const appEnvApi = {
  /** 与 process.platform 一致 */
  getPlatform: (): AppPlatform => process.platform,

  getProcessVersions: (): AppProcessVersions => {
    const v = process.versions
    return {
      electron: v.electron,
      chrome: v.chrome,
      node: v.node,
      ...Object.fromEntries(Object.entries(v)),
    }
  },
}
