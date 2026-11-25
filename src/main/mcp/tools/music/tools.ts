/**
 * 音乐控制 MCP 工具定义（通过 McpContext 运行时获取容器注入的 MusicPlayer）
 */

import type { MusicPlatform } from './types'
import { getLogger } from '../../../utils/logger'
import { getMusicPlayerFromRuntime } from '../../McpContext'
import { PropertyList, PropertyType } from '../../types'
import { defineTool } from '../registry'

const logger = getLogger('MusicTools')

function requireMusicPlayer() {
  const player = getMusicPlayerFromRuntime()
  if (!player)
    throw new Error('MusicPlayer 未初始化')
  return player
}

function withPlayerJson(
  fn: (player: ReturnType<typeof requireMusicPlayer>, args: Record<string, unknown>) => Promise<unknown>,
) {
  return async (args: Record<string, unknown>): Promise<string> => {
    const result = await fn(requireMusicPlayer(), args)
    return JSON.stringify(result, null, 2)
  }
}

defineTool({
  name: 'self.music.search',
  description: `Search for music from online music platforms.
Supports platforms: kuwo (酷我), netease (网易云), qq (QQ音乐), kugou (酷狗)

Parameters:
- keyword: Search keyword (song name, artist, album, etc.) (required)
- platform: Music platform to search (default: kuwo)
- limit: Maximum number of results (1-100, default: 20)`,
  properties: new PropertyList([
    { name: 'keyword', type: PropertyType.STRING },
    { name: 'platform', type: PropertyType.STRING, defaultValue: 'kuwo' },
    { name: 'limit', type: PropertyType.INTEGER, defaultValue: 20, minValue: 1, maxValue: 100 },
  ]),
  callback: withPlayerJson((player, args) =>
    player.search(
      args.keyword as string,
      ((args.platform as string) || 'kuwo') as MusicPlatform,
      (args.limit as number) || 20,
    ),
  ),
})

defineTool({
  name: 'self.music.play',
  description: `Play music from a song ID (from search results) or a direct URL/local file path.
Supports: song ID from search results, direct http/https audio URLs, or local audio files.

Parameters:
- file_path: Song ID, direct URL, or local file path (required)
- start_position: Starting position in seconds (default: 0)
- song_name / artist / album: Optional song metadata`,
  properties: new PropertyList([
    { name: 'file_path', type: PropertyType.STRING },
    { name: 'start_position', type: PropertyType.INTEGER, defaultValue: 0 },
    { name: 'song_name', type: PropertyType.STRING, defaultValue: '' },
    { name: 'artist', type: PropertyType.STRING, defaultValue: '' },
    { name: 'album', type: PropertyType.STRING, defaultValue: '' },
  ]),
  callback: withPlayerJson(async (player, args) => {
    let filePath = args.file_path as string
    if (/^\d+$/.test(filePath)) {
      logger.info(`检测到歌曲 ID: ${filePath}，开始解析播放 URL`)
      const resolvedUrl = await player.resolvePlayUrl(filePath)
      if (!resolvedUrl) {
        return {
          success: false,
          message: `无法解析歌曲 ID ${filePath} 的播放地址，直链 API 可能不可用`,
        }
      }
      filePath = resolvedUrl
    }

    return player.play(filePath, (args.start_position as number) || 0, {
      name: (args.song_name as string) || '',
      artist: (args.artist as string) || '',
      album: (args.album as string) || '',
    })
  }),
})

defineTool({
  name: 'self.music.pause',
  description: 'Pause the currently playing music. The playback position will be saved and can be resumed later.',
  properties: new PropertyList([]),
  callback: withPlayerJson(player => player.pause()),
})

defineTool({
  name: 'self.music.resume',
  description: 'Resume the paused music from where it was paused.',
  properties: new PropertyList([]),
  callback: withPlayerJson(player => player.resume()),
})

defineTool({
  name: 'self.music.stop',
  description: 'Stop the music playback completely and reset to the beginning.',
  properties: new PropertyList([]),
  callback: withPlayerJson(player => player.stop()),
})

defineTool({
  name: 'self.music.set_volume',
  description: 'Set the music playback volume (0-100). Only affects music volume, not system or TTS volume.',
  properties: new PropertyList([
    { name: 'volume', type: PropertyType.INTEGER, minValue: 0, maxValue: 100 },
  ]),
  callback: withPlayerJson((player, args) => player.setVolume(args.volume as number)),
})

defineTool({
  name: 'self.music.seek',
  description: 'Seek to a specific position (in seconds) in the currently playing music.',
  properties: new PropertyList([
    { name: 'position', type: PropertyType.NUMBER },
  ]),
  callback: withPlayerJson((player, args) => player.seek(args.position as number)),
})

defineTool({
  name: 'self.music.set_loop',
  description: 'Enable or disable loop/repeat mode for music playback.',
  properties: new PropertyList([
    { name: 'loop', type: PropertyType.BOOLEAN },
  ]),
  callback: withPlayerJson((player, args) => player.setLoop(args.loop as boolean)),
})

defineTool({
  name: 'self.music.set_playback_rate',
  description: 'Set the music playback speed/rate (0.5-2.0).',
  properties: new PropertyList([
    { name: 'rate', type: PropertyType.NUMBER, minValue: 0.5, maxValue: 2.0 },
  ]),
  callback: withPlayerJson((player, args) => player.setPlaybackRate(args.rate as number)),
})

defineTool({
  name: 'self.music.get_status',
  description: 'Get the current music playback status and information (state, file, position, volume, loop, rate).',
  properties: new PropertyList([]),
  callback: withPlayerJson(player => player.getStatus()),
})

defineTool({
  name: 'self.music.get_lyrics',
  description: 'Get LRC lyrics for a song from online music platforms.',
  properties: new PropertyList([
    { name: 'song_id', type: PropertyType.STRING },
    { name: 'platform', type: PropertyType.STRING, defaultValue: 'kuwo' },
  ]),
  callback: withPlayerJson((player, args) =>
    player.getLyrics(
      args.song_id as string,
      ((args.platform as string) || 'kuwo') as MusicPlatform,
    ),
  ),
})
