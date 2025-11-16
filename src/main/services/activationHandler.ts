import { SystemInitializer } from '../services/systemInitializer'
import { showActivation } from '../windows/windowManager'

// 全局保存初始化结果，供 IPC 访问
let globalInitializer: SystemInitializer | null = null

/**
 * 获取全局初始化器实例
 */
export function getGlobalInitializer(): SystemInitializer | null {
  return globalInitializer
}

/**
 * 处理应用启动时的激活检测
 * @returns 是否激活成功（true=可以继续启动主程序，false=激活失败需要退出）
 */
export async function handleActivationOnStartup(): Promise<boolean> {
  try {
    // 创建系统初始化器并运行初始化流程
    const initializer = new SystemInitializer()
    const result = await initializer.runInitialization()

    // 保存到全局变量
    globalInitializer = initializer

    // 如果初始化失败
    if (!result.success) {
      console.error('[启动] 初始化失败:', result.error)
      return false
    }

    // 如果需要显示激活界面
    if (result.need_activation_ui) {
      console.log('[启动] 显示激活界面')

      // 显示激活窗口
      showActivation()

      // 这里不阻塞，让激活窗口自行处理
      // 激活窗口会在激活成功后自动关闭
      // 用户可以在激活窗口中完成激活流程
      return true
    }

    // 不需要激活，直接继续
    console.log('[启动] 启动完成，进入主界面')
    return true
  }
  catch (error) {
    console.error('[启动] 激活检测过程出错:', error)
    return false
  }
}
