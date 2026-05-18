/**
 * 应用管理相关类型定义
 */

/** 进程信息 */
export interface ProcessInfo {
  /** 进程 ID */
  pid: number
  /** 进程名称 */
  name: string
  /** 完整命令 */
  command: string
  /** CPU 使用率 (%) */
  cpu?: number
  /** 内存使用 (MB) */
  memory?: number
  /** 窗口标题（Windows tasklist /V 提供） */
  windowTitle?: string
  /** 用户名（Windows tasklist /V 提供） */
  userName?: string
  /** 该可执行文件的进程实例数（去重合并后） */
  instances?: number
}

/** 应用信息 */
export interface AppInfo {
  /** 应用名称（用于启动） */
  name: string
  /** 显示名称 */
  displayName: string
  /** 应用路径 */
  path: string
  /** 应用类型 */
  type: 'application' | 'system' | 'user_application'
}

/** 平台类型 */
export type Platform = 'darwin' | 'win32' | 'linux'

/** 启动结果 */
export interface LaunchResult {
  success: boolean
  message: string
}
