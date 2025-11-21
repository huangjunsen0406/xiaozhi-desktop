import type { EmotionConfig, EmotionState, EmotionType } from '../types/emotion'
import { computed, reactive, readonly } from 'vue'

/**
 * 表情管理 Composable
 *
 * 功能：
 * - 自动加载表情资源
 * - 缓存已加载的表情图片
 * - 提供降级机制（图片 → neutral.png）
 * - 避免重复更新
 *
 * @param config - 表情配置
 */
export function useEmotion(config: EmotionConfig = {}) {
  const {
    defaultEmotion = 'neutral',
    enableCache = true,
  } = config

  // 使用 Vite 的 import.meta.glob 加载所有表情图片
  const emojiAssets = import.meta.glob<string>('../assets/emoji/*.{png,gif,jpg,jpeg,webp}', {
    eager: true,
    import: 'default',
  })

  // 表情缓存：emotion -> image URL
  const emotionCache = new Map<EmotionType, string>()

  // 初始化缓存
  if (enableCache) {
    Object.entries(emojiAssets).forEach(([path, url]) => {
      // 从路径中提取文件名（不带扩展名）
      // 例如：../assets/emoji/happy.png -> happy
      const match = path.match(/\/([^/]+)\.(png|gif|jpg|jpeg|webp)$/)
      if (match) {
        const emotionName = match[1] as EmotionType
        emotionCache.set(emotionName, url)
      }
    })
  }

  // 响应式状态
  const state = reactive<EmotionState>({
    current: defaultEmotion,
    imageUrl: '',
  })

  /**
   * 获取表情图片 URL
   * 降级策略：
   * 1. 尝试获取指定表情的图片
   * 2. 如果不存在，降级到 neutral.png
   */
  const getEmotionImageUrl = (emotion: EmotionType): string => {
    // 优先从缓存获取
    if (emotionCache.has(emotion)) {
      return emotionCache.get(emotion)!
    }

    // 尝试从资源中查找（支持多种扩展名）
    const extensions = ['png', 'gif', 'jpg', 'jpeg', 'webp']
    for (const ext of extensions) {
      const path = `../assets/emoji/${emotion}.${ext}`
      if (emojiAssets[path]) {
        const url = emojiAssets[path]
        // 更新缓存
        if (enableCache) {
          emotionCache.set(emotion, url)
        }
        return url
      }
    }

    // 如果不是 neutral 且找不到，降级到 neutral
    if (emotion !== 'neutral') {
      return getEmotionImageUrl('neutral')
    }

    // 理论上 neutral.png 应该始终存在，这里返回空字符串作为最后兜底
    console.error('[useEmotion] neutral.png 不存在！')
    return ''
  }

  /**
   * 更新表情
   * @param emotion - 表情类型
   */
  const setEmotion = (emotion: EmotionType): void => {
    // 避免重复更新
    if (state.current === emotion && state.imageUrl) {
      return
    }

    console.log(`[useEmotion] 切换表情: ${state.current} -> ${emotion}`)

    state.current = emotion

    // 获取图片 URL（始终返回有效的 URL，降级到 neutral.png）
    state.imageUrl = getEmotionImageUrl(emotion)
  }

  /**
   * 重置到默认表情
   */
  const reset = (): void => {
    setEmotion(defaultEmotion)
  }

  // 初始化默认表情
  setEmotion(defaultEmotion)

  return {
    // 只读状态
    state: readonly(state),

    // 计算属性：当前表情
    emotion: computed(() => state.current),

    // 计算属性：当前表情图片 URL
    imageUrl: computed(() => state.imageUrl),

    // 方法
    setEmotion,
    reset,
  }
}
