export interface IpcResultSuccess<T = unknown> {
  success: true
  data: T
}

export interface IpcResultError {
  success: false
  error: string
}

export type IpcResult<T = unknown> = IpcResultSuccess<T> | IpcResultError

export interface FileDialogResult {
  canceled: boolean
  filePaths: string[]
  bookmarks?: string[]
}
