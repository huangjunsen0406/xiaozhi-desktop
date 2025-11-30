/**
 * 音乐工具管理器
 * 负责注册音乐相关的 MCP 工具
 */

import type { PropertyList, PropertyType } from '../../types'
import { MusicPlayer } from './MusicPlayer'

import { getLogger } from '../../../utils/logger'

const logger = getLogger('MusicToolsManager')

/**
 * 音乐工具管理器
 */
export class MusicToolsManager {
  private static instance: MusicToolsManager | null = null
  private musicPlayer: MusicPlayer

  private constructor() {
    this.musicPlayer = MusicPlayer.getInstance()
    logger.info('音乐工具管理器初始化')
  }

  static getInstance(): MusicToolsManager {
    if (!MusicToolsManager.instance) {
      MusicToolsManager.instance = new MusicToolsManager()
    }
    return MusicToolsManager.instance
  }

  /**
   * 注册所有音乐工具
   */
  register(
    addTool: (name: string, description: string, properties: PropertyList, callback: (args: Record<string, unknown>) => Promise<string>) => void,
    PropertyListClass: typeof PropertyList,
    PropertyTypeEnum: typeof PropertyType,
  ): void {
    logger.info('开始注册音乐工具')

    this.registerSearchMusic(addTool, PropertyListClass, PropertyTypeEnum)
    this.registerPlayMusic(addTool, PropertyListClass, PropertyTypeEnum)
    this.registerPauseMusic(addTool, PropertyListClass, PropertyTypeEnum)
    this.registerResumeMusic(addTool, PropertyListClass, PropertyTypeEnum)
    this.registerStopMusic(addTool, PropertyListClass, PropertyTypeEnum)
    this.registerSetVolume(addTool, PropertyListClass, PropertyTypeEnum)
    this.registerSeek(addTool, PropertyListClass, PropertyTypeEnum)
    this.registerSetLoop(addTool, PropertyListClass, PropertyTypeEnum)
    this.registerSetPlaybackRate(addTool, PropertyListClass, PropertyTypeEnum)
    this.registerGetStatus(addTool, PropertyListClass, PropertyTypeEnum)
    this.registerGetLyrics(addTool, PropertyListClass, PropertyTypeEnum)

    logger.info('音乐工具注册完成')
  }

  /**
   * 注册搜索音乐工具
   */
  private registerSearchMusic(
    addTool: (name: string, description: string, properties: PropertyList, callback: (args: Record<string, unknown>) => Promise<string>) => void,
    PropertyListClass: typeof PropertyList,
    PropertyTypeEnum: typeof PropertyType,
  ): void {
    const props = new PropertyListClass([
      {
        name: 'keyword',
        type: PropertyTypeEnum.STRING,
      },
      {
        name: 'platform',
        type: PropertyTypeEnum.STRING,
        defaultValue: 'kuwo',
      },
      {
        name: 'limit',
        type: PropertyTypeEnum.INTEGER,
        defaultValue: 20,
        minValue: 1,
        maxValue: 100,
      },
    ])

    const description = `Search for music from online music platforms.
Supports platforms: kuwo (酷我), netease (网易云), qq (QQ音乐), kugou (酷狗)

Use this tool when:
1. User wants to search for a song by name, artist, or album
2. User says "搜索歌曲", "找首歌", "search for music"
3. User provides a song title or artist name to search

Parameters:
- keyword: Search keyword (song name, artist, album, etc.) (required)
- platform: Music platform to search (default: kuwo)
  - "kuwo": 酷我音乐
  - "netease": 网易云音乐
  - "qq": QQ音乐
  - "kugou": 酷狗音乐
- limit: Maximum number of results (1-100, default: 20)

Returns JSON with:
- success: Whether search succeeded
- keyword: The search keyword
- total: Total number of results found
- results: Array of song objects with id, name, artist, album, url, pic, lrc

Examples:
- "搜索 恶作剧" -> keyword="恶作剧", platform="kuwo"
- "Find songs by Jay Chou" -> keyword="Jay Chou", platform="kuwo"
- "Search 晴天 on netease" -> keyword="晴天", platform="netease"`

    addTool(
      'self.music.search',
      description,
      props,
      async (args: Record<string, unknown>): Promise<string> => {
        const keyword = args.keyword as string
        const platform = (args.platform as string) || 'kuwo'
        const limit = (args.limit as number) || 20

        const result = await this.musicPlayer.search(keyword, platform as 'kuwo' | 'netease' | 'qq' | 'kugou', limit)
        return JSON.stringify(result, null, 2)
      },
    )

    logger.info('注册搜索音乐工具成功')
  }

  /**
   * 注册播放音乐工具
   */
  private registerPlayMusic(
    addTool: (name: string, description: string, properties: PropertyList, callback: (args: Record<string, unknown>) => Promise<string>) => void,
    PropertyListClass: typeof PropertyList,
    PropertyTypeEnum: typeof PropertyType,
  ): void {
    const props = new PropertyListClass([
      {
        name: 'file_path',
        type: PropertyTypeEnum.STRING,
      },
      {
        name: 'start_position',
        type: PropertyTypeEnum.INTEGER,
        defaultValue: 0,
      },
      {
        name: 'song_name',
        type: PropertyTypeEnum.STRING,
        defaultValue: '',
      },
      {
        name: 'artist',
        type: PropertyTypeEnum.STRING,
        defaultValue: '',
      },
      {
        name: 'album',
        type: PropertyTypeEnum.STRING,
        defaultValue: '',
      },
    ])

    const description = `Play music from a URL or local file path.
Supports:
- Online music URLs (from search results)
- Local audio files (MP3, FLAC, WAV, OGG, AAC, M4A)

Use this tool when:
1. User asks to play a song after searching
2. User provides a music URL
3. User wants to play local audio files
4. User specifies a starting position

Parameters:
- file_path: Music URL or local file path (required)
  - URL format: https://music-dl.sayqz.com/api/?source=kuwo&id=828701&type=url
  - Local format: /path/to/song.mp3
- start_position: Starting position in seconds (optional, default: 0)
- song_name: Song name from search results (optional, for better user feedback)
- artist: Artist name from search results (optional, for better user feedback)
- album: Album name from search results (optional, for better user feedback)

Examples:
- "播放第一首" -> file_path="<url>", song_name="菊花台", artist="周杰伦", album="依然范特西"
- "Play the song" -> file_path="https://music-dl.sayqz.com/...", start_position=0
- "从30秒开始播放" -> file_path="<url>", start_position=30

Workflow:
1. First use self.music.search to find songs
2. Extract song info (name, artist, album) from search results
3. Call self.music.play with url AND song metadata
4. Optionally use self.music.get_lyrics to show lyrics

Returns:
- success: Whether playback started successfully
- message: Status message
- file: The URL/path being played
- startPosition: The starting position
- songInfo: Song metadata (name, artist, album, duration, platform) if provided`

    addTool(
      'self.music.play',
      description,
      props,
      async (args: Record<string, unknown>): Promise<string> => {
        const filePath = args.file_path as string
        const startPosition = (args.start_position as number) || 0
        const songName = (args.song_name as string) || ''
        const artist = (args.artist as string) || ''
        const album = (args.album as string) || ''

        const result = await this.musicPlayer.play(filePath, startPosition, {
          name: songName,
          artist,
          album,
        })
        return JSON.stringify(result, null, 2)
      },
    )

    logger.info('注册播放音乐工具成功')
  }

  /**
   * 注册暂停音乐工具
   */
  private registerPauseMusic(
    addTool: (name: string, description: string, properties: PropertyList, callback: (args: Record<string, unknown>) => Promise<string>) => void,
    PropertyListClass: typeof PropertyList,
    _PropertyTypeEnum: typeof PropertyType,
  ): void {
    const props = new PropertyListClass([])

    const description = `Pause the currently playing music.
The playback position will be saved and can be resumed later.

Use this tool when:
1. User asks to pause or stop the music temporarily
2. User says "pause", "暂停", "停一下"
3. Before playing a different audio (TTS, another song)

Examples:
- "暂停音乐" -> Pauses current playback
- "Pause the song" -> Pauses current playback

Returns:
- success: Whether pause was successful
- message: Status message
- currentTime: Current playback position in seconds`

    addTool(
      'self.music.pause',
      description,
      props,
      async (_args: Record<string, unknown>): Promise<string> => {
        const result = await this.musicPlayer.pause()
        return JSON.stringify(result, null, 2)
      },
    )

    logger.info('注册暂停音乐工具成功')
  }

  /**
   * 注册恢复播放工具
   */
  private registerResumeMusic(
    addTool: (name: string, description: string, properties: PropertyList, callback: (args: Record<string, unknown>) => Promise<string>) => void,
    PropertyListClass: typeof PropertyList,
    _PropertyTypeEnum: typeof PropertyType,
  ): void {
    const props = new PropertyListClass([])

    const description = `Resume the paused music from where it was paused.

Use this tool when:
1. User asks to resume or continue playback
2. User says "继续", "resume", "continue playing"
3. After a temporary pause

Examples:
- "继续播放" -> Resumes from paused position
- "Resume music" -> Resumes from paused position

Returns:
- success: Whether resume was successful
- message: Status message`

    addTool(
      'self.music.resume',
      description,
      props,
      async (_args: Record<string, unknown>): Promise<string> => {
        const result = await this.musicPlayer.resume()
        return JSON.stringify(result, null, 2)
      },
    )

    logger.info('注册恢复播放工具成功')
  }

  /**
   * 注册停止播放工具
   */
  private registerStopMusic(
    addTool: (name: string, description: string, properties: PropertyList, callback: (args: Record<string, unknown>) => Promise<string>) => void,
    PropertyListClass: typeof PropertyList,
    _PropertyTypeEnum: typeof PropertyType,
  ): void {
    const props = new PropertyListClass([])

    const description = `Stop the music playback completely and reset to the beginning.
Unlike pause, stop resets the playback position to 0.

Use this tool when:
1. User asks to stop the music completely
2. User says "停止音乐", "stop music", "关闭音乐"
3. User wants to end the current playback session

Examples:
- "停止播放" -> Stops and resets to beginning
- "Stop the music" -> Stops and resets to beginning

Returns:
- success: Whether stop was successful
- message: Status message`

    addTool(
      'self.music.stop',
      description,
      props,
      async (_args: Record<string, unknown>): Promise<string> => {
        const result = await this.musicPlayer.stop()
        return JSON.stringify(result, null, 2)
      },
    )

    logger.info('注册停止播放工具成功')
  }

  /**
   * 注册设置音量工具
   */
  private registerSetVolume(
    addTool: (name: string, description: string, properties: PropertyList, callback: (args: Record<string, unknown>) => Promise<string>) => void,
    PropertyListClass: typeof PropertyList,
    PropertyTypeEnum: typeof PropertyType,
  ): void {
    const props = new PropertyListClass([
      {
        name: 'volume',
        type: PropertyTypeEnum.INTEGER,
        minValue: 0,
        maxValue: 100,
      },
    ])

    const description = `Set the music playback volume.
This only affects music volume, not system volume or TTS volume.

Use this tool when:
1. User asks to adjust music volume
2. User says "音乐声音调到50", "set music volume to 80"
3. User wants to make music louder or quieter

Parameters:
- volume: Volume level (0-100), where 0 is mute and 100 is maximum

Examples:
- "把音乐音量调到50" -> volume=50
- "Make music quieter" -> volume=30 (example)
- "Mute the music" -> volume=0

Returns:
- success: Whether volume was set successfully
- message: Status message
- volume: The new volume level`

    addTool(
      'self.music.set_volume',
      description,
      props,
      async (args: Record<string, unknown>): Promise<string> => {
        const volume = args.volume as number

        const result = await this.musicPlayer.setVolume(volume)
        return JSON.stringify(result, null, 2)
      },
    )

    logger.info('注册设置音量工具成功')
  }

  /**
   * 注册跳转工具
   */
  private registerSeek(
    addTool: (name: string, description: string, properties: PropertyList, callback: (args: Record<string, unknown>) => Promise<string>) => void,
    PropertyListClass: typeof PropertyList,
    PropertyTypeEnum: typeof PropertyType,
  ): void {
    const props = new PropertyListClass([
      {
        name: 'position',
        type: PropertyTypeEnum.NUMBER,
      },
    ])

    const description = `Seek to a specific position in the currently playing music.
Jump forward, backward, or to an exact timestamp.

Use this tool when:
1. User asks to skip to a specific time
2. User says "跳到1分30秒", "seek to 2 minutes", "快进到30秒"
3. User wants to replay a section or skip ahead

Parameters:
- position: Target position in seconds (can be decimal, e.g., 90.5 for 1 minute 30.5 seconds)

Examples:
- "跳到30秒" -> position=30
- "Skip to 2 minutes" -> position=120
- "Go back to 1:30" -> position=90

Returns:
- success: Whether seek was successful
- message: Status message
- position: The new playback position`

    addTool(
      'self.music.seek',
      description,
      props,
      async (args: Record<string, unknown>): Promise<string> => {
        const position = args.position as number

        const result = await this.musicPlayer.seek(position)
        return JSON.stringify(result, null, 2)
      },
    )

    logger.info('注册跳转工具成功')
  }

  /**
   * 注册设置循环播放工具
   */
  private registerSetLoop(
    addTool: (name: string, description: string, properties: PropertyList, callback: (args: Record<string, unknown>) => Promise<string>) => void,
    PropertyListClass: typeof PropertyList,
    PropertyTypeEnum: typeof PropertyType,
  ): void {
    const props = new PropertyListClass([
      {
        name: 'loop',
        type: PropertyTypeEnum.BOOLEAN,
      },
    ])

    const description = `Enable or disable loop/repeat mode for music playback.
When enabled, the current song will automatically restart after finishing.

Use this tool when:
1. User asks to repeat or loop the song
2. User says "循环播放", "repeat this song", "单曲循环"
3. User wants to disable looping

Parameters:
- loop: true to enable looping, false to disable

Examples:
- "单曲循环" -> loop=true
- "Repeat this song" -> loop=true
- "关闭循环" -> loop=false

Returns:
- success: Whether loop mode was set successfully
- message: Status message
- loop: The new loop state`

    addTool(
      'self.music.set_loop',
      description,
      props,
      async (args: Record<string, unknown>): Promise<string> => {
        const loop = args.loop as boolean

        const result = await this.musicPlayer.setLoop(loop)
        return JSON.stringify(result, null, 2)
      },
    )

    logger.info('注册设置循环播放工具成功')
  }

  /**
   * 注册设置播放速度工具
   */
  private registerSetPlaybackRate(
    addTool: (name: string, description: string, properties: PropertyList, callback: (args: Record<string, unknown>) => Promise<string>) => void,
    PropertyListClass: typeof PropertyList,
    PropertyTypeEnum: typeof PropertyType,
  ): void {
    const props = new PropertyListClass([
      {
        name: 'rate',
        type: PropertyTypeEnum.NUMBER,
        minValue: 0.5,
        maxValue: 2.0,
      },
    ])

    const description = `Set the music playback speed/rate.
Values less than 1.0 slow down playback, greater than 1.0 speed it up.

Use this tool when:
1. User asks to change playback speed
2. User says "1.5倍速播放", "play at 0.75x speed", "快速播放"
3. User wants to slow down or speed up the music

Parameters:
- rate: Playback rate (0.5-2.0)
  - 0.5 = half speed (slower)
  - 1.0 = normal speed
  - 1.5 = 1.5x speed (faster)
  - 2.0 = double speed (fastest)

Examples:
- "1.5倍速播放" -> rate=1.5
- "Slow down to 0.75x" -> rate=0.75
- "恢复正常速度" -> rate=1.0

Returns:
- success: Whether playback rate was set successfully
- message: Status message
- rate: The new playback rate`

    addTool(
      'self.music.set_playback_rate',
      description,
      props,
      async (args: Record<string, unknown>): Promise<string> => {
        const rate = args.rate as number

        const result = await this.musicPlayer.setPlaybackRate(rate)
        return JSON.stringify(result, null, 2)
      },
    )

    logger.info('注册设置播放速度工具成功')
  }

  /**
   * 注册获取播放状态工具
   */
  private registerGetStatus(
    addTool: (name: string, description: string, properties: PropertyList, callback: (args: Record<string, unknown>) => Promise<string>) => void,
    PropertyListClass: typeof PropertyList,
    _PropertyTypeEnum: typeof PropertyType,
  ): void {
    const props = new PropertyListClass([])

    const description = `Get the current music playback status and information.
Returns detailed information about what's playing, current position, volume, etc.

Use this tool when:
1. User asks about current playback status
2. User says "现在在播放什么", "what's playing?", "音乐播放到哪了"
3. Need to check playback state before taking action

Returns JSON with:
- state: Playback state (idle/loading/playing/paused/stopped/error)
- currentFile: Path to the currently loaded file
- currentTime: Current playback position in seconds
- duration: Total duration of the track in seconds
- volume: Current volume level (0-100)
- loop: Whether loop mode is enabled
- playbackRate: Current playback speed (0.5-2.0)
- error: Error message if state is 'error'

Examples:
- "现在播放到哪了?" -> Returns current status with position
- "What's the current song?" -> Returns file path and status`

    addTool(
      'self.music.get_status',
      description,
      props,
      async (_args: Record<string, unknown>): Promise<string> => {
        const result = await this.musicPlayer.getStatus()
        return JSON.stringify(result, null, 2)
      },
    )

    logger.info('注册获取状态工具成功')
  }

  /**
   * 注册获取歌词工具
   */
  private registerGetLyrics(
    addTool: (name: string, description: string, properties: PropertyList, callback: (args: Record<string, unknown>) => Promise<string>) => void,
    PropertyListClass: typeof PropertyList,
    PropertyTypeEnum: typeof PropertyType,
  ): void {
    const props = new PropertyListClass([
      {
        name: 'song_id',
        type: PropertyTypeEnum.STRING,
      },
      {
        name: 'platform',
        type: PropertyTypeEnum.STRING,
        defaultValue: 'kuwo',
      },
    ])

    const description = `Get lyrics for a song from online music platforms.
Returns LRC format lyrics with timestamps.

Use this tool when:
1. User asks for song lyrics
2. User says "显示歌词", "show lyrics", "what are the lyrics"
3. After playing a song, user wants to see the words

Parameters:
- song_id: Song ID from search results (required)
- platform: Music platform (default: kuwo)
  - "kuwo": 酷我音乐
  - "netease": 网易云音乐
  - "qq": QQ音乐
  - "kugou": 酷狗音乐

Returns:
- success: Whether lyrics were retrieved
- message: Status message
- lyrics: LRC format lyrics with timestamps

Examples:
- After search, get the song id: results[0].id = "828701"
- "显示歌词" -> song_id="828701", platform="kuwo"
- "Show me the lyrics" -> song_id="<id from search>", platform="kuwo"

Workflow:
1. Use self.music.search to find a song
2. Extract the song id from search results
3. Use self.music.get_lyrics with that id to get lyrics`

    addTool(
      'self.music.get_lyrics',
      description,
      props,
      async (args: Record<string, unknown>): Promise<string> => {
        const songId = args.song_id as string
        const platform = (args.platform as string) || 'kuwo'

        const result = await this.musicPlayer.getLyrics(songId, platform as 'kuwo' | 'netease' | 'qq' | 'kugou')
        return JSON.stringify(result, null, 2)
      },
    )

    logger.info('注册获取歌词工具成功')
  }
}
