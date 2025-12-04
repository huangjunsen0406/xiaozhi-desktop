/**
 * 音乐播放相关的 IPC 处理器
 */
import type { MusicStatus } from '../mcp/tools/music/types'
import { ipcMain } from 'electron'
import { MusicPlayer } from '../mcp/tools/music'

import { getLogger } from '../utils/logger'

const logger = getLogger('MusicIpc')

/**
 * 注册音乐相关的 IPC 处理器
 */
export function registerMusicIpc(): void {
  const musicPlayer = MusicPlayer.getInstance()

  /**
   * 接收渲染进程的状态更新
   * 当音乐播放状态变化时，渲染进程会通知主进程
   */
  ipcMain.on('music:status-update', (_event, status: Partial<MusicStatus>) => {
    musicPlayer.updateStatus(status)
  })

  logger.info('音乐 IPC 处理器已注册')
}
