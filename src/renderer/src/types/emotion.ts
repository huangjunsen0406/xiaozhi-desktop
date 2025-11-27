/**
 * 支持的表情类型
 */
export type EmotionType
  = | 'neutral'
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

/**
 * 表情元数据（用于设置页面）
 */
export interface EmotionMeta {
  type: EmotionType
  label: string
}

/**
 * 自定义表情映射配置
 */
export interface EmotionCustomMapping {
  [emotionType: string]: string // emotion type -> custom image filename
}

/**
 * 21种表情的元数据
 */
export const EMOTION_METADATA: EmotionMeta[] = [
  { type: 'neutral', label: '默认' },
  { type: 'happy', label: '开心' },
  { type: 'laughing', label: '大笑' },
  { type: 'funny', label: '搞笑' },
  { type: 'sad', label: '伤心' },
  { type: 'angry', label: '生气' },
  { type: 'crying', label: '哭泣' },
  { type: 'loving', label: '喜爱' },
  { type: 'embarrassed', label: '尴尬' },
  { type: 'surprised', label: '震惊' },
  { type: 'shocked', label: '惊讶' },
  { type: 'thinking', label: '思考' },
  { type: 'winking', label: '眨眼' },
  { type: 'cool', label: '酷炫' },
  { type: 'relaxed', label: '放松' },
  { type: 'delicious', label: '美味' },
  { type: 'kissy', label: '亲亲' },
  { type: 'confident', label: '自信' },
  { type: 'sleepy', label: '困倦' },
  { type: 'silly', label: '傻笑' },
  { type: 'confused', label: '困惑' },
]
