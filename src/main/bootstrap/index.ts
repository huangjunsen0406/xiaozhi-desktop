/**
 * Bootstrap 模块 — 桶式导出
 *
 * 对齐 py-xiaozhi src/bootstrap：
 * - ConversationSession：听/说/TTS 会话状态机
 * - pluginWiring：插件注册、共享服务、音频直连、资源池
 * - health：关键插件健康检查
 */

export { ConversationSession } from './ConversationSession'
export { checkCriticalPlugins } from './health'
export type { PluginSetupResult } from './health'
export {
  bindSharedServices,
  registerCleanupResources,
  setAudioPluginBackgroundWindow,
  setupPlugins,
  setupShortcutManager,
  unbindSharedServices,
} from './pluginWiring'
export type { SetupPluginsResult } from './pluginWiring'
