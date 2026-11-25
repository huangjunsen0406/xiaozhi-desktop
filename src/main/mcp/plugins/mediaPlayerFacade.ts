/**
 * 外挂媒体播放 SDK（Host capability: media_player）
 */

import type { MusicPlayer } from '../tools/music/MusicPlayer'
import type {
  MediaPlayerFacade,
  MediaPlayerPlayOptions,
  MediaPlayerResult,
  MediaPlayerStatus,
} from './types'
import { getLogger } from '../../utils/logger'

const logger = getLogger('MediaPlayerFacade')

function fail(message: string): MediaPlayerResult {
  return { success: false, message }
}

export function validateMediaUrl(url: unknown): { ok: true, url: string } | { ok: false, error: string } {
  if (typeof url !== 'string' || !url.trim()) {
    return { ok: false, error: 'url 必须为非空字符串' }
  }
  const trimmed = url.trim()

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const u = new URL(trimmed)
      if (u.protocol !== 'http:' && u.protocol !== 'https:')
        return { ok: false, error: '仅支持 http/https URL' }
      return { ok: true, url: trimmed }
    }
    catch {
      return { ok: false, error: 'URL 格式无效' }
    }
  }

  // 本地绝对路径须先于 scheme 判断：Windows `C:\...` 会被误判成 protocol
  if (trimmed.startsWith('/') || /^[a-z]:[\\/]/i.test(trimmed)) {
    return { ok: true, url: trimmed }
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return { ok: false, error: '不支持的 URL 协议（仅 http/https 或本地绝对路径）' }
  }

  return {
    ok: false,
    error: '本地路径须为绝对路径（如 /path/to/a.m4a 或 C:\\\\Music\\\\a.mp3）',
  }
}

export function createMediaPlayerFacade(player: MusicPlayer): MediaPlayerFacade {
  let lastTitle: string | null = null

  return {
    async playUrl(url: string, opts?: MediaPlayerPlayOptions): Promise<MediaPlayerResult> {
      const checked = validateMediaUrl(url)
      if (!checked.ok) {
        logger.warn('playUrl 拒绝', { error: checked.error })
        return fail(checked.error)
      }

      const start = typeof opts?.startPosition === 'number' && opts.startPosition >= 0
        ? opts.startPosition
        : 0
      const title = typeof opts?.title === 'string' ? opts.title.trim() : undefined
      lastTitle = title || null

      const { success, message } = await player.play(
        checked.url,
        start,
        title ? { name: title } : undefined,
      )
      return { success, message }
    },

    async pause(): Promise<MediaPlayerResult> {
      const { success, message } = await player.pause()
      return { success, message }
    },

    async resume(): Promise<MediaPlayerResult> {
      const { success, message } = await player.resume()
      return { success, message }
    },

    async stop(): Promise<MediaPlayerResult> {
      const { success, message } = await player.stop()
      if (success)
        lastTitle = null
      return { success, message }
    },

    async seek(positionSec: number): Promise<MediaPlayerResult> {
      if (typeof positionSec !== 'number' || !Number.isFinite(positionSec) || positionSec < 0) {
        return fail('position 须为非负数字（秒）')
      }
      const { success, message } = await player.seek(positionSec)
      return { success, message }
    },

    async getStatus(): Promise<MediaPlayerStatus> {
      const result = await player.getStatus()
      if (!result.success || !result.status) {
        return {
          state: 'error',
          error: result.message || '获取状态失败',
          title: lastTitle,
        }
      }
      const s = result.status
      return {
        state: s.state,
        url: s.currentFile,
        title: lastTitle,
        currentTime: s.currentTime,
        duration: s.duration,
        volume: s.volume,
        error: s.error,
      }
    },
  }
}
