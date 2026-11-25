export type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'stopped' | 'error'
export type MusicPlatform = 'kuwo' | 'netease' | 'qq' | 'kugou'

export interface MusicSearchResult {
  id: string
  name: string
  artist: string
  album: string
  url: string
  pic: string
  lrc: string
  platform: MusicPlatform
}

export interface MusicStatus {
  state: PlaybackState
  currentFile: string | null
  currentTime: number
  duration: number
  volume: number
  loop: boolean
  playbackRate: number
  error?: string
}

export interface MusicCommandResult {
  success: boolean
  message: string
}

export interface PlayMusicResult extends MusicCommandResult {
  file?: string
  startPosition?: number
  songInfo?: {
    name?: string
    artist?: string
    album?: string
    duration?: number
    platform?: string
  }
}

export interface PauseMusicResult extends MusicCommandResult {
  currentTime?: number
}

export type ResumeMusicResult = MusicCommandResult
export type StopMusicResult = MusicCommandResult

export interface SetVolumeResult extends MusicCommandResult {
  volume?: number
}

export interface SeekResult extends MusicCommandResult {
  position?: number
}

export interface SetLoopResult extends MusicCommandResult {
  loop?: boolean
}

export interface SetPlaybackRateResult extends MusicCommandResult {
  rate?: number
}

export interface GetStatusResult {
  success: boolean
  status?: MusicStatus
  message?: string
}

export interface SearchMusicResult extends MusicCommandResult {
  keyword?: string
  total?: number
  results?: MusicSearchResult[]
}

export interface GetLyricsResult extends MusicCommandResult {
  lyrics?: string
}
