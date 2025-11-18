/**
 * 统一激活服务
 * 整合 SystemInitializer、ActivationManager 和 activationHandler 的功能
 */
import type { ActivationData } from '../types/protocol'
import { showActivation } from '../windows/windowManager'
import { ActivationManager } from './activationManager'
import { SystemInitializer } from './systemInitializer'

/**
 * 初始化结果
 */
export interface InitResult {
  success: boolean
  needActivationUI: boolean
  message: string
  error?: string
}

/**
 * 激活服务
 * 提供设备激活相关的所有功能
 */
export class ActivationService {
  private static instance: ActivationService | null = null

  private systemInitializer: SystemInitializer | null = null
  private activationManager: ActivationManager

  private constructor() {
    this.activationManager = ActivationManager.getInstance()
  }

  /**
   * 获取单例实例
   */
  static getInstance(): ActivationService {
    if (!ActivationService.instance) {
      ActivationService.instance = new ActivationService()
    }
    return ActivationService.instance
  }

  /**
   * 处理应用启动时的激活检测
   * 整合自 activationHandler.handleActivationOnStartup
   */
  async handleStartup(): Promise<InitResult> {
    try {
      console.log('[ActivationService] 开始启动时激活检测')

      // 创建系统初始化器并运行初始化流程
      this.systemInitializer = new SystemInitializer()
      const result = await this.systemInitializer.runInitialization()

      // 如果初始化失败
      if (!result.success) {
        console.error('[ActivationService] 初始化失败:', result.error)
        return {
          success: false,
          needActivationUI: false,
          message: result.status_message || '初始化失败',
          error: result.error,
        }
      }

      // 如果需要显示激活界面
      if (result.need_activation_ui) {
        console.log('[ActivationService] 显示激活界面')
        showActivation()

        return {
          success: true,
          needActivationUI: true,
          message: result.status_message,
        }
      }

      // 不需要激活，直接继续
      console.log('[ActivationService] 启动完成，进入主界面')
      return {
        success: true,
        needActivationUI: false,
        message: result.status_message,
      }
    }
    catch (error) {
      console.error('[ActivationService] 激活检测过程出错:', error)
      return {
        success: false,
        needActivationUI: false,
        message: '激活检测出错',
        error: String(error),
      }
    }
  }

  /**
   * 获取激活数据（用于 IPC）
   */
  getActivationData(): ActivationData | null {
    if (!this.systemInitializer) {
      return null
    }
    return this.systemInitializer.getActivationData()
  }

  /**
   * 开始激活流程
   */
  async startActivation(data: ActivationData): Promise<boolean> {
    console.log('[ActivationService] 开始激活流程')
    return await this.activationManager.processActivation(data)
  }

  /**
   * 取消激活流程
   */
  cancelActivation(): void {
    console.log('[ActivationService] 取消激活流程')
    this.activationManager.cancelActivation()
  }

  /**
   * 检查是否正在激活
   */
  isActivating(): boolean {
    return this.activationManager.isActivatingNow()
  }

  /**
   * 检查设备是否已激活
   */
  isActivated(): boolean {
    return this.activationManager.isActivated()
  }

  /**
   * 获取设备信息
   */
  getDeviceInfo() {
    return this.activationManager.getDeviceInfo()
  }

  /**
   * 获取系统初始化器（用于高级访问）
   */
  getSystemInitializer(): SystemInitializer | null {
    return this.systemInitializer
  }
}

/**
 * 获取激活服务单例
 */
export function getActivationService(): ActivationService {
  return ActivationService.getInstance()
}
