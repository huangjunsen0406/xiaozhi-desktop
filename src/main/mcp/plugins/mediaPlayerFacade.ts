/**
 * 外挂媒体播放 SDK（Host capability: media_player / music_player）
 *
 * 包装主进程 MusicPlayer，只暴露播控，不暴露 search / 配置 / sendCommand。
 * 出声路径：MusicPlayer → music:command → 后台音频窗 HTMLAudioElement。
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

/**
 * 校验插件传入的媒体地址：仅 http(s) 或本地绝对路径。
 */
export function validateMediaUrl(url: unknown): { ok: true, url: string } | { ok: false, error: string } {
  if (typeof url !== 'string' || !url.trim()) {
    return { ok: false, error: 'url 必须为非空字符串' }
  }
  const trimmed = url.trim()

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const u = new URL(trimmed)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        return { ok: false, error: '仅支持 http/https URL' }
      }
      return { ok: true, url: trimmed }
    }
    catch {
      return { ok: false, error: 'URL 格式无效' }
    }
  }

  // 本地绝对路径须先于 scheme 判断：Windows `C:\...` 会被误判成 protocol
  const isPosixAbs = trimmed.startsWith('/')
  const isWinAbs = /^[a-z]:[\\/]/i.test(trimmed)
  if (isPosixAbs || isWinAbs) {
    return { ok: true, url: trimmed }
  }

  // 拒绝 file: 及其它自定义 scheme（本地请用绝对路径，由播放器转 file://）
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return { ok: false, error: '不支持的 URL 协议（仅 http/https 或本地绝对路径）' }
  }

  return {
    ok: false,
    error: '本地路径须为绝对路径（如 /path/to/a.m4a 或 C:\\\\Music\\\\a.mp3）',
  }
}

/**
 * 基于容器内 MusicPlayer 创建外挂用 SDK。
 */
export function createMediaPlayerFacade(player: MusicPlayer): MediaPlayerFacade {
  let lastTitle: string | null = null

  const facade: MediaPlayerFacade = {
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

      try {
        const result = await player.play(
          checked.url,
          start,
          title ? { name: title } : undefined,
        )
        return {
          success: result.success,
          message: result.message,
        }
      }
      catch (error) {
        const message = error instanceof Error ? error.message : '播放失败'
        logger.error('playUrl 异常', error)
        return fail(message)
      }
    },

    async pause(): Promise<MediaPlayerResult> {
      try {
        const result = await player.pause()
        return { success: result.success, message: result.message }
      }
      catch (error) {
        return fail(error instanceof Error ? error.message : '暂停失败')
      }
    },

    async resume(): Promise<MediaPlayerResult> {
      try {
        const result = await player.resume()
        return { success: result.success, message: result.message }
      }
      catch (error) {
        return fail(error instanceof Error ? error.message : '恢复播放失败')
      }
    },

    async stop(): Promise<MediaPlayerResult> {
      try {
        const result = await player.stop()
        if (result.success)
          lastTitle = null
        return { success: result.success, message: result.message }
      }
      catch (error) {
        return fail(error instanceof Error ? error.message : '停止失败')
      }
    },

    async seek(positionSec: number): Promise<MediaPlayerResult> {
      if (typeof positionSec !== 'number' || !Number.isFinite(positionSec) || positionSec < 0) {
        return fail('position 须为非负数字（秒）')
      }
      try {
        const result = await player.seek(positionSec)
        return { success: result.success, message: result.message }
      }
      catch (error) {
        return fail(error instanceof Error ? error.message : '跳转失败')
      }
    },

    async getStatus(): Promise<MediaPlayerStatus> {
      try {
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
      }
      catch (error) {
        return {
          state: 'error',
          error: error instanceof Error ? error.message : '获取状态失败',
          title: lastTitle,
        }
      }
    },
  }

  return facade
}
