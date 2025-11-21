import type { EmotionConfig, EmotionState, EmotionType } from '../types/emotion'
import { computed, onUnmounted, reactive, readonly } from 'vue'

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
   * 1. 优先尝试获取自定义图片
   * 2. 如果没有自定义，使用默认图片
   * 3. 如果默认图片不存在，降级到 neutral.png
   *
   * @param emotion - 表情类型
   * @param forceRefresh - 是否强制刷新缓存（用于上传新图片后）
   */
  const getEmotionImageUrl = async (emotion: EmotionType, forceRefresh = false): Promise<string> => {
    try {
      // 1. 优先检查自定义图片
      const customPath = await window.api.emotionGetCustomPath(emotion)
      if (customPath) {
        console.log(`[useEmotion] 使用自定义表情: ${emotion}`)
        // base64 data URL 不需要时间戳，每次都是新生成的
        return customPath
      }
    }
    catch (error) {
      console.warn(`[useEmotion] 获取自定义表情失败: ${emotion}`, error)
    }

    // 2. 使用默认图片（从缓存或 assets）
    // 优先从缓存获取
    if (emotionCache.has(emotion) && !forceRefresh) {
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

    // 3. 如果不是 neutral 且找不到，降级到 neutral
    if (emotion !== 'neutral') {
      return getEmotionImageUrl('neutral', forceRefresh)
    }

    // 理论上 neutral.png 应该始终存在，这里返回空字符串作为最后兜底
    console.error('[useEmotion] neutral.png 不存在！')
    return ''
  }

  /**
   * 更新表情
   * @param emotion - 表情类型
   * @param forceRefresh - 是否强制刷新缓存
   */
  const setEmotion = async (emotion: EmotionType, forceRefresh = false): Promise<void> => {
    // 如果强制刷新，跳过重复检查
    if (!forceRefresh && state.current === emotion && state.imageUrl) {
      return
    }

    console.log(`[useEmotion] 切换表情: ${state.current} -> ${emotion}${forceRefresh ? ' (强制刷新)' : ''}`)

    state.current = emotion

    // 获取图片 URL（异步，优先自定义，降级到默认）
    state.imageUrl = await getEmotionImageUrl(emotion, forceRefresh)
  }

  /**
   * 刷新当前表情（强制重新加载）
   * 用于自定义图片上传后更新显示
   */
  const refresh = async (): Promise<void> => {
    await setEmotion(state.current, true)
  }

  /**
   * 重置到默认表情
   */
  const reset = (): void => {
    setEmotion(defaultEmotion)
  }

  // 初始化默认表情
  setEmotion(defaultEmotion)

  // 监听表情变更事件（从设置页面广播）
  window.api.emotionOnChanged((emotionType: string) => {
    console.log(`[useEmotion] 收到表情变更事件: ${emotionType}`)
    // 如果当前显示的就是变更的表情，强制刷新
    if (state.current === emotionType) {
      setEmotion(emotionType as EmotionType, true)
    }
  })

  // 清理监听器
  onUnmounted(() => {
    window.api.emotionRemoveChangedListener()
  })

  return {
    // 只读状态
    state: readonly(state),

    // 计算属性：当前表情
    emotion: computed(() => state.current),

    // 计算属性：当前表情图片 URL
    imageUrl: computed(() => state.imageUrl),

    // 方法
    setEmotion,
    refresh,
    reset,
  }
}
