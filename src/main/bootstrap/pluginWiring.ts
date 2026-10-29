/**
 * 插件与共享服务装配
 *
 * 集中：创建 McpServer / MusicPlayer、注册插件清单、资源池清理、音频直连。
 * 对齐 py-xiaozhi bootstrap/plugin_wiring。
 */

import type { BrowserWindow } from 'electron'
import type { PluginCommands, PluginContext } from '../core/interfaces'
import type { ServiceContainer } from '../core/ServiceContainer'
import type { PluginSetupResult } from './health'
import { setMcpToolRuntime } from '../mcp/McpContext'
import { McpServer } from '../mcp/McpServer'
import { runMcpPluginOperation } from '../mcp/plugins/operations'
import { MusicPlayer } from '../mcp/tools/music/MusicPlayer'
import { AudioPlugin } from '../plugins/AudioPlugin'
import { ChatPlugin } from '../plugins/ChatPlugin'
import { Live2DPlugin } from '../plugins/Live2DPlugin'
import { McpPlugin } from '../plugins/McpPlugin'
import { UIPlugin } from '../plugins/UIPlugin'
import { WakeWordPlugin } from '../plugins/WakeWordPlugin'
import { getDatabase } from '../services/database'
import { ShortcutManager } from '../services/ShortcutManager'
import { getLogger } from '../utils/logger'
import { checkCriticalPlugins } from './health'

const logger = getLogger('PluginWiring')

/**
 * 创建跨插件共享服务（McpServer + MusicPlayer），仅容器持有
 *
 * 不再写入模块级业务单例；插件经构造注入拿到同一实例。
 */
export function bindSharedServices(container: ServiceContainer): void {
  if (!container.musicPlayer) {
    container.musicPlayer = MusicPlayer.create()
    logger.debug('共享服务已创建: MusicPlayer')
  }

  if (!container.mcpServer) {
    container.mcpServer = McpServer.create()
    logger.debug('共享服务已创建: McpServer')
  }

  container.mcpServer.setMusicPlayer(container.musicPlayer)
  setMcpToolRuntime({ musicPlayer: container.musicPlayer })
}

/**
 * 释放共享服务引用（资源池最后阶段调用）
 */
export async function unbindSharedServices(container: ServiceContainer): Promise<void> {
  if (container.mcpServer) {
    try {
      const server = container.mcpServer
      await runMcpPluginOperation(() => server.detach())
    }
    catch (error) {
      logger.debug('detach McpServer 失败', error)
    }
  }
  container.mcpServer = null
  container.musicPlayer = null
  setMcpToolRuntime({ musicPlayer: null, timerService: null, screenshotTool: null })
}

export interface SetupPluginsResult {
  audioPlugin: AudioPlugin | null
  wakeWordPlugin: WakeWordPlugin | null
  setupResults: PluginSetupResult[]
  healthy: boolean
}

/**
 * 绑定共享服务、注册并初始化插件、挂资源清理与音频直连
 */
export async function setupPlugins(
  container: ServiceContainer,
  ctx: PluginContext,
  cmd: PluginCommands,
): Promise<SetupPluginsResult> {
  bindSharedServices(container)

  const audioPlugin = new AudioPlugin()
  const wakeWordPlugin = new WakeWordPlugin()
  const mcpPlugin = new McpPlugin(container.mcpServer!)

  container.getPluginManager().register(
    audioPlugin,
    new Live2DPlugin(),
    mcpPlugin,
    new ChatPlugin(),
    wakeWordPlugin,
    new UIPlugin(),
  )

  const setupResults = await container.getPluginManager().setupAll(ctx, cmd)

  // 关键插件健康检查（轻量）
  const healthy = checkCriticalPlugins(container.getPluginManager(), setupResults)

  // 设置音频直连通道（TTS 音频不经过 EventBus，减少延迟）
  const audioOk = setupResults.find(r => r.pluginName === 'AudioPlugin')?.success !== false
  if (audioOk) {
    container.protocolManager.setAudioHandler((data) => {
      audioPlugin.onIncomingAudio(data)
    })
    logger.info('入站音频已直连 AudioPlugin（绕过 EventBus）')
  }
  else {
    logger.warn('AudioPlugin 未就绪，入站音频将走 EventBus fallback')
  }

  return {
    audioPlugin,
    wakeWordPlugin,
    setupResults,
    healthy,
  }
}

/**
 * 将所有模块的清理函数注册到资源池
 *
 * ResourcePool 按注册逆序释放（先注册的后释放）。
 * 期望关闭顺序：
 * session → tasks → protocol → plugins → shortcutManager → shared_services → eventBus
 */
export function registerCleanupResources(
  container: ServiceContainer,
  shortcutManager: ShortcutManager | null,
): void {
  const pool = container.resourcePool

  // 最先注册 = 最后释放
  pool.register('eventBus', () => {
    container.eventBus.clear()
  })

  pool.register('shared_services', async () => {
    await unbindSharedServices(container)
  })

  pool.register('shortcutManager', () => {
    shortcutManager?.destroy()
  })

  pool.register('plugins', async () => {
    await container.getPluginManager().stopAll()
    await container.getPluginManager().shutdownAll()
  })

  pool.register('protocol', async () => {
    container.protocolManager.setAudioHandler(null)
    await container.protocolManager.shutdown()
  })

  pool.register('tasks', async () => {
    await container.taskManager.drain(3000)
  })

  // 最后注册 = 最先释放：先解绑会话，排空命令后再销毁协议/插件
  pool.register('session', () => {
    container.session.unbindEvents()
  })
}

/**
 * 初始化快捷键管理器
 */
export async function setupShortcutManager(
  container: ServiceContainer,
): Promise<ShortcutManager> {
  const db = getDatabase()
  const shortcutManager = new ShortcutManager(db, container)
  await shortcutManager.registerAll()
  return shortcutManager
}

/**
 * 设置后台音频窗口到 AudioPlugin（由 index.ts 调用）
 */
export function setAudioPluginBackgroundWindow(
  audioPlugin: AudioPlugin | null,
  window: BrowserWindow,
): void {
  if (audioPlugin) {
    audioPlugin.setBackgroundAudioWindow(window)
    logger.info('AudioPlugin 窗口引用已设置')
  }
}
