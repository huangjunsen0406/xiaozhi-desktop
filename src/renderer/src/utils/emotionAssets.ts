import type { EmotionType } from '../types/emotion'
import { EMOTION_METADATA } from '../types/emotion'

export type EmotionAssetSource = 'custom' | 'builtin' | 'fallback'

export interface EmotionAsset {
  emotion: EmotionType
  url: string
  source: EmotionAssetSource
}

const emotionAssets = import.meta.glob<string>('../assets/emoji/*.{png,gif,jpg,jpeg,webp}', {
  eager: true,
  import: 'default',
})

const emotionNames = new Set<string>(EMOTION_METADATA.map(emotion => emotion.type))

const builtinAssets = new Map<string, string>()
for (const [assetPath, url] of Object.entries(emotionAssets)) {
  const match = assetPath.match(/\/([^/]+)\.(png|gif|jpg|jpeg|webp)$/)
  if (match && !builtinAssets.has(match[1]))
    builtinAssets.set(match[1], url)
}

export function normalizeEmotion(value: string | null | undefined, fallback: EmotionType = 'neutral'): EmotionType {
  return value && emotionNames.has(value) ? value as EmotionType : fallback
}

export async function resolveEmotionAsset(value: string): Promise<EmotionAsset> {
  const emotion = normalizeEmotion(value)
  try {
    const customUrl = await window.api.emotionGetCustomPath(emotion)
    if (customUrl)
      return { emotion, url: customUrl, source: 'custom' }
  }
  catch (error) {
    console.warn(`获取自定义表情失败: ${emotion}`, error)
  }

  const builtinUrl = builtinAssets.get(emotion)
  if (builtinUrl)
    return { emotion, url: builtinUrl, source: 'builtin' }

  if (emotion !== 'neutral') {
    const fallback = await resolveEmotionAsset('neutral')
    return { ...fallback, source: 'fallback' }
  }
  return { emotion: 'neutral', url: '', source: 'fallback' }
}
