/**
 * 打字机效果 Composable
 * 使用 requestAnimationFrame 实现平滑的打字机效果
 */
import { ref } from 'vue'

export function useTypewriter() {
  const typewriterQueue = ref<string[]>([]) // 待打字的句子队列
  let animationFrameId: number | null = null
  let lastFrameTime = 0
  const CHAR_INTERVAL = 50 // 每个字符间隔 50ms

  /**
   * 启动打字机效果
   */
  function startTypewriter(
    getCurrentContent: () => string,
    updateContent: (content: string) => void,
    onComplete?: () => void,
  ) {
    let currentCharIndex = 0
    let currentSentence = typewriterQueue.value.shift() || ''
    lastFrameTime = performance.now()

    const typeNextChar = (timestamp: number) => {
      // 计算时间差
      const elapsed = timestamp - lastFrameTime

      // 如果时间间隔足够，添加下一个字符
      if (elapsed >= CHAR_INTERVAL) {
        if (currentCharIndex < currentSentence.length) {
          // 添加一个字符
          const currentContent = getCurrentContent()
          updateContent(currentContent + currentSentence[currentCharIndex])
          currentCharIndex++
          lastFrameTime = timestamp
        }
        else {
          // 当前句子打完了，检查队列
          if (typewriterQueue.value.length > 0) {
            currentSentence = typewriterQueue.value.shift() || ''
            currentCharIndex = 0
          }
          else {
            // 队列为空，停止打字效果
            stopTypewriter()
            if (onComplete) {
              onComplete()
            }
            return
          }
        }
      }

      // 继续下一帧
      animationFrameId = requestAnimationFrame(typeNextChar)
    }

    // 启动动画循环
    animationFrameId = requestAnimationFrame(typeNextChar)
  }

  /**
   * 停止打字机效果
   */
  function stopTypewriter() {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId)
      animationFrameId = null
    }
  }

  /**
   * 添加句子到打字队列
   */
  function addToQueue(text: string) {
    typewriterQueue.value.push(text)
  }

  /**
   * 获取队列中剩余的内容（用于立即显示）
   */
  function getRemainingContent(): string {
    const remaining = typewriterQueue.value.join('')
    typewriterQueue.value = []
    return remaining
  }

  /**
   * 清空队列
   */
  function clearQueue() {
    typewriterQueue.value = []
  }

  /**
   * 检查是否正在运行
   */
  function isRunning(): boolean {
    return animationFrameId !== null
  }

  return {
    typewriterQueue,
    startTypewriter,
    stopTypewriter,
    addToQueue,
    getRemainingContent,
    clearQueue,
    isRunning,
  }
}
