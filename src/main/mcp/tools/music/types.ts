/**
 * 音乐工具类型定义
 */

/**
 * 播放状态
 */
export type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'stopped' | 'error'

/**
 * 音乐平台
 */
export type MusicPlatform = 'kuwo' | 'netease' | 'qq' | 'kugou'

/**
 * 搜索结果歌曲信息
 */
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

/**
 * 音乐播放器状态
 */
export interface MusicStatus {
  /** 播放状态 */
  state: PlaybackState
  /** 当前播放文件路径 */
  currentFile: string | null
  /** 当前播放位置（秒） */
  currentTime: number
  /** 总时长（秒） */
  duration: number
  /** 音量 (0-100) */
  volume: number
  /** 是否循环播放 */
  loop: boolean
  /** 播放速度 (0.5-2.0) */
  playbackRate: number
  /** 错误信息 */
  error?: string
}

/**
 * 播放音乐结果
 */
export interface PlayMusicResult {
  success: boolean
  message: string
  file?: string
  startPosition?: number
  // 歌曲信息（如果可用）
  songInfo?: {
    name?: string
    artist?: string
    album?: string
    duration?: number
    platform?: string
  }
}

/**
 * 暂停音乐结果
 */
export interface PauseMusicResult {
  success: boolean
  message: string
  currentTime?: number
}

/**
 * 恢复播放结果
 */
export interface ResumeMusicResult {
  success: boolean
  message: string
}

/**
 * 停止播放结果
 */
export interface StopMusicResult {
  success: boolean
  message: string
}

/**
 * 设置音量结果
 */
export interface SetVolumeResult {
  success: boolean
  message: string
  volume?: number
}

/**
 * 跳转播放位置结果
 */
export interface SeekResult {
  success: boolean
  message: string
  position?: number
}

/**
 * 设置循环播放结果
 */
export interface SetLoopResult {
  success: boolean
  message: string
  loop?: boolean
}

/**
 * 设置播放速度结果
 */
export interface SetPlaybackRateResult {
  success: boolean
  message: string
  rate?: number
}

/**
 * 获取播放状态结果
 */
export interface GetStatusResult {
  success: boolean
  status?: MusicStatus
  message?: string
}

/**
 * 搜索音乐结果
 */
export interface SearchMusicResult {
  success: boolean
  message: string
  keyword?: string
  total?: number
  results?: MusicSearchResult[]
}

/**
 * 获取歌词结果
 */
export interface GetLyricsResult {
  success: boolean
  message: string
  lyrics?: string
}
