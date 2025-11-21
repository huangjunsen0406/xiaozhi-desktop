/**
 * 支持的表情类型
 */
export type EmotionType =
  | 'neutral'
  | 'happy'
  | 'laughing'
  | 'funny'
  | 'sad'
  | 'angry'
  | 'crying'
  | 'loving'
  | 'embarrassed'
  | 'surprised'
  | 'shocked'
  | 'thinking'
  | 'winking'
  | 'cool'
  | 'relaxed'
  | 'delicious'
  | 'kissy'
  | 'confident'
  | 'sleepy'
  | 'silly'
  | 'confused'

/**
 * 表情配置
 */
export interface EmotionConfig {
  /** 默认表情 */
  defaultEmotion?: EmotionType
  /** 是否启用缓存 */
  enableCache?: boolean
}

/**
 * 表情状态
 */
export interface EmotionState {
  /** 当前表情 */
  current: EmotionType
  /** 表情图片 URL（找不到时降级到 neutral.png） */
  imageUrl: string
}
