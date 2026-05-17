<script setup lang="ts">
import type { AppStateSnapshot, ServerMessage } from '@shared/types'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

const bubbleText = ref('')
const arrowX = ref<number | null>(null)

let removeStateListener: (() => void) | null = null
let removeMessageListener: (() => void) | null = null
let removeArrowListener: (() => void) | null = null
let bubbleTimer: ReturnType<typeof setTimeout> | null = null

// 气泡整体（content + arrow）以 arrowX 为水平中心
// 默认（无 IPC 推送）居中
// 注意：transform 在 CSS 里写，避免覆盖 Transition 的入场 translateY
const bubbleStyle = computed(() => {
  if (arrowX.value === null) {
    return { left: '50%' }
  }
  return { left: `${arrowX.value}px` }
})

/**
 * 显示气泡文字
 */
function showBubble(text: string, autoHideMs = 0): void {
  if (bubbleTimer) {
    clearTimeout(bubbleTimer)
    bubbleTimer = null
  }
  bubbleText.value = text
  if (autoHideMs > 0) {
    bubbleTimer = setTimeout(() => {
      bubbleText.value = ''
      bubbleTimer = null
    }, autoHideMs)
  }
}

/**
 * 隐藏气泡
 */
function hideBubble(): void {
  if (bubbleTimer) {
    clearTimeout(bubbleTimer)
    bubbleTimer = null
  }
  bubbleText.value = ''
}

/**
 * 处理设备状态变更
 */
function handleStateChanged(state: AppStateSnapshot): void {
  const deviceState = state.deviceState
  if (deviceState === 'idle') {
    hideBubble()
  }
  else if (deviceState === 'connecting') {
    showBubble('连接中...')
  }
  else if (deviceState === 'listening') {
    showBubble('聆听中...')
  }
  // speaking 状态下等服务器消息内容填充
}

/**
 * 处理服务器消息（获取 AI 回复文字）
 */
function handleServerMessage(message: ServerMessage): void {
  if (message.type === 'tts' && message.state === 'sentence_start' && message.text) {
    showBubble(message.text, 5000)
  }
  else if (message.type === 'llm' && message.text) {
    showBubble(message.text, 5000)
  }
}

// 监听 bubbleText 变化，通知主进程显示/隐藏气泡窗口
watch(bubbleText, (newVal) => {
  if (newVal) {
    window.electron?.ipcRenderer.send('bubble:show')
  }
  else {
    window.electron?.ipcRenderer.send('bubble:hide')
  }
})

onMounted(() => {
  // 监听设备状态变更
  removeStateListener = window.api?.appOnStateChanged?.(handleStateChanged) ?? null

  // 监听服务器消息
  removeMessageListener = window.api?.appOnServerMessage?.(handleServerMessage) ?? null

  // 监听主进程下发的箭头位置（边缘场景下气泡整体滑动指向精灵中心）
  const ipc = window.electron?.ipcRenderer
  if (ipc) {
    const arrowHandler = (_event: unknown, x: number): void => {
      if (typeof x === 'number' && Number.isFinite(x))
        arrowX.value = x
    }
    ipc.on('bubble:set-arrow-x', arrowHandler)
    removeArrowListener = () => ipc.removeListener('bubble:set-arrow-x', arrowHandler)
  }
})

onUnmounted(() => {
  if (removeStateListener) {
    removeStateListener()
    removeStateListener = null
  }
  if (removeMessageListener) {
    removeMessageListener()
    removeMessageListener = null
  }
  if (removeArrowListener) {
    removeArrowListener()
    removeArrowListener = null
  }
  if (bubbleTimer) {
    clearTimeout(bubbleTimer)
    bubbleTimer = null
  }
})
</script>

<template>
  <div class="bubble-container">
    <Transition name="bubble">
      <div v-if="bubbleText" class="bubble" :style="bubbleStyle">
        <div class="bubble-content">
          {{ bubbleText }}
        </div>
        <div class="bubble-arrow" />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.bubble-container {
  position: relative;
  width: 100vw;
  height: 100vh;
  background: transparent;
  pointer-events: none;
}

/* 气泡整体：宽度由 content 决定，整体跟随 arrowX 平移 */
.bubble {
  position: absolute;
  bottom: 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 320px;
  transform: translateX(-50%);
}

.bubble-content {
  background: white;
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 13px;
  line-height: 1.4;
  color: #333;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-all;
}

/* 深色模式 */
:global(.dark) .bubble-content {
  /* background: #2a2a2a; */
  color: #ddd;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}

/* 小三角箭头：在 content 下方水平居中 */
.bubble-arrow {
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 6px solid white;
}

:global(.dark) .bubble-arrow {
  border-top-color: #2a2a2a;
}

/* 淡入淡出动画 */
.bubble-enter-active,
.bubble-leave-active {
  transition: opacity 0.3s, transform 0.3s;
}

.bubble-enter-from,
.bubble-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(4px);
}
</style>
