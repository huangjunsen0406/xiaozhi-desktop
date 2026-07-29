/**
 * 音乐播放相关的 IPC 处理器
 */
import type { MusicStatus } from '../mcp/tools/music/types'
import { ipcMain } from 'electron'
import { getServiceContainer } from '../core/ServiceContainer'

import { getLogger } from '../utils/logger'

const logger = getLogger('MusicIpc')

/**
 * 注册音乐相关的 IPC 处理器
 *
 * 使用容器持有的 MusicPlayer（bindSharedServices 创建）。
 * 若在 container 初始化前注册，handler 内惰性解析。
 */
export function registerMusicIpc(): void {
  /**
   * 接收渲染进程的状态更新
   * 当音乐播放状态变化时，渲染进程会通知主进程
   */
  ipcMain.on('music:status-update', (_event, status: Partial<MusicStatus>) => {
    try {
      const musicPlayer = getServiceContainer().getMusicPlayer()
      if (!musicPlayer) {
        logger.warn('MusicPlayer 尚未就绪，忽略 status-update')
        return
      }
      musicPlayer.updateStatus(status)
    }
    catch (error) {
      logger.warn('处理 music:status-update 失败（container 可能未就绪）', error)
    }
  })

  logger.info('音乐 IPC 处理器已注册')
}
