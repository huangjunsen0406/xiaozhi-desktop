/**
 * IPC 层依赖注入接口定义
 * 用于统一管理 IPC 模块的依赖
 */
import type { Application } from '../services/Application'

/**
 * IPC 注册上下文
 * 包含所有 IPC 模块需要的依赖
 */
export interface IpcContext {
  /** Application 单例实例 */
  application: Application
}

/**
 * IPC 处理结果标准格式
 */
export interface IpcResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

/**
 * 激活初始化结果
 */
export interface ActivationInitResult {
  success: boolean
  need_activation_ui: boolean
  error?: string
}

/**
 * 设备信息
 */
export interface DeviceInfo {
  serialNumber: string
  macAddress: string
  activationStatus: boolean
}

/**
 * 激活数据
 */
export interface ActivationData {
  challenge: string
  code: string
  message?: string
}

/**
 * 激活结果
 */
export interface ActivationResult {
  success: boolean
  error?: string
}

/**
 * 激活状态
 */
export interface ActivationStatus {
  isActivated: boolean
}

/**
 * 应用状态快照
 */
export interface AppStateSnapshot {
  device_state: string
  listening_mode: string
  keep_listening: boolean
  audio_opened: boolean
}
