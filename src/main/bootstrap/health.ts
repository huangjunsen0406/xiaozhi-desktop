import type { PluginExecutionResult, PluginManager } from '../plugins/PluginManager'
import { getLogger } from '../utils/logger'

const logger = getLogger('Health')
const DEFAULT_CRITICAL_PLUGINS = ['AudioPlugin', 'UIPlugin'] as const

export type PluginSetupResult = PluginExecutionResult

export function checkCriticalPlugins(
  plugins: PluginManager,
  setupResults: PluginSetupResult[],
  criticalNames: readonly string[] = DEFAULT_CRITICAL_PLUGINS,
): boolean {
  const failedCritical: string[] = []

  for (const name of criticalNames) {
    const result = setupResults.find(r => r.pluginName === name)
    if (result && !result.success) {
      failedCritical.push(name)
      logger.error(
        `关键插件 ${name} 初始化失败: ${result.error?.message ?? 'unknown'}`,
        result.error,
      )
      continue
    }

    if (!plugins.getPlugin(name)) {
      logger.warn(`关键插件 ${name} 未注册`)
    }
  }

  if (failedCritical.length > 0) {
    logger.error(`关键插件健康检查未通过: ${failedCritical.join(', ')}。应用可能处于降级/半残状态`)
    return false
  }

  logger.info('关键插件健康检查通过')
  return true
}
