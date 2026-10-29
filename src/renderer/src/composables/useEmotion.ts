import type { EmotionConfig, EmotionState } from '../types/emotion'
import { computed, onUnmounted, reactive, readonly } from 'vue'
import { normalizeEmotion, resolveEmotionAsset } from '../utils/emotionAssets'

/**
 * 表情管理 Composable
 *
 * 负责当前表情状态和资源加载；资源解析规则由 emotionAssets 统一维护。
 */
export function useEmotion(config: EmotionConfig = {}) {
  const { defaultEmotion = 'neutral' } = config
  const state = reactive<EmotionState>({
    current: defaultEmotion,
    imageUrl: '',
  })
  let requestId = 0
  let requestedEmotion = defaultEmotion
  let disposed = false

  async function setEmotion(emotion: string, forceRefresh = false): Promise<void> {
    const normalized = normalizeEmotion(emotion, defaultEmotion)
    requestedEmotion = normalized
    const currentRequestId = ++requestId
    if (!forceRefresh && state.current === normalized && state.imageUrl)
      return

    const asset = await resolveEmotionAsset(normalized)
    if (!disposed && currentRequestId === requestId) {
      state.current = normalized
      state.imageUrl = asset.url
    }
  }

  async function refresh(): Promise<void> {
    await setEmotion(requestedEmotion, true)
  }

  function reset(): void {
    void setEmotion(defaultEmotion, true)
  }

  void setEmotion(defaultEmotion)

  const removeEmotionListener = window.api.emotionOnChanged((emotionType: string) => {
    if (requestedEmotion === normalizeEmotion(emotionType))
      void setEmotion(emotionType, true)
  })

  onUnmounted(() => {
    disposed = true
    requestId++
    removeEmotionListener()
  })

  return {
    state: readonly(state),
    emotion: computed(() => state.current),
    imageUrl: computed(() => state.imageUrl),
    setEmotion,
    refresh,
    reset,
  }
}
