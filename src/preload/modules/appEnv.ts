import process from 'node:process'

export type AppPlatform = NodeJS.Platform | string

export interface AppProcessVersions {
  electron?: string
  chrome?: string
  node?: string
  [key: string]: string | undefined
}

export const appEnvApi = {
  getPlatform: (): AppPlatform => process.platform,
  getProcessVersions: (): AppProcessVersions => ({ ...process.versions }),
}
