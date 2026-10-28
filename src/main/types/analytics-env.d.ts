/** 由 electron-vite 仅在主进程构建时替换；不读取应用运行环境。 */
declare const __OPENPANEL_CONFIG__: {
  readonly apiUrl: string
  readonly clientId: string
  readonly clientSecret: string
}
