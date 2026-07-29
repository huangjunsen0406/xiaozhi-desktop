/**
 * 关键插件健康检查（轻量版）
 *
 * 对齐 py-xiaozhi health 的日志职责：关键插件失败时给出清晰日志，
 * 避免静默半残。完整 env 降级旗标本轮不实现。
 */

import type { PluginManager } from '../plugins/PluginManager'
import { PluginState } from '../plugins/Plugin'
import { getLogger } from '../utils/logger'

const logger = getLogger('Health')

/** 默认关键插件（失败时应明确告警） */
const DEFAULT_CRITICAL_PLUGINS = ['AudioPlugin', 'UIPlugin'] as const

export interface PluginSetupResult {
  pluginName: string
  success: boolean
  error?: Error
  duration: number
}

/**
 * 检查关键插件 setup 结果，输出清晰告警
 *
 * @returns 是否全部关键插件健康
 */
export function checkCriticalPlugins(
  plugins: PluginManager,
  setupResults: PluginSetupResult[],
  criticalNames: readonly string[] = DEFAULT_CRITICAL_PLUGINS,
): boolean {
  const failedCritical: string[] = []

  for (const name of criticalNames) {
    const result = setupResults.find(r => r.pluginName === name)
    const plugin = plugins.getPlugin(name)

    if (result && !result.success) {
      failedCritical.push(name)
      logger.error(
        `关键插件 ${name} 初始化失败: ${result.error?.message ?? 'unknown'}`,
        result.error,
      )
      continue
    }

    if (plugin && plugin.state === PluginState.ERROR) {
      failedCritical.push(name)
      logger.error(`关键插件 ${name} 处于 ERROR 状态`)
    }
    else if (!plugin) {
      logger.warn(`关键插件 ${name} 未注册`)
    }
  }

  if (failedCritical.length > 0) {
    logger.error(
      `关键插件健康检查未通过: ${failedCritical.join(', ')}。应用可能处于降级/半残状态`,
    )
    return false
  }

  logger.info('关键插件健康检查通过')
  return true
}
