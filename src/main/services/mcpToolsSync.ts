import type { McpToolsSyncResult } from '../../shared/types/mcp'
import { getServiceContainer } from '../core/ServiceContainer'
import { getLogger } from '../utils/logger'
import { reconnectIfConnectedKeepingIdle } from './settingsApply'

const logger = getLogger('McpToolsSync')

/** Local changes stay committed even when publishing the new tool list fails. */
export async function syncMcpTools(): Promise<McpToolsSyncResult> {
  try {
    const hadConnection = getServiceContainer().isAudioChannelOpened()
    const reconnected = await reconnectIfConnectedKeepingIdle()
    if (!hadConnection)
      return { status: 'deferred' }
    return reconnected ? { status: 'synced' } : { status: 'failed', error: '重连后连接未就绪，请重试刷新' }
  }
  catch (error) {
    logger.warn('工具列表已在本地生效，云端同步失败', error)
    return { status: 'failed', error: error instanceof Error ? error.message : String(error) }
  }
}
