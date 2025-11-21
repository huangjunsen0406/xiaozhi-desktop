import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

/**
 * 设备状态类型
 */
export type DeviceState = 'idle' | 'listening' | 'speaking'

/**
 * 应用状态快照
 */
export interface AppStateSnapshot {
  deviceState: DeviceState
  channelOpen: boolean
}

/**
 * 消息类型
 */
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

/**
 * 通话状态 Store
 * 用于在多个窗口间同步通话状态、表情和对话内容
 */
export const useCallStore = defineStore('call', () => {
  // 设备状态
  const deviceState = ref<DeviceState>('idle')

  // 音频通道是否打开
  const channelOpen = ref(false)

  // 当前表情
  const emotion = ref<string>('neutral')

  // 对话消息列表
  const messages = ref<ChatMessage[]>([])

  // 当前显示的文本（用于实时更新）
  const currentText = ref<string>('')

  /**
   * 是否正在通话
   * 当设备状态不是 idle 或音频通道打开时，认为正在通话
   */
  const isCalling = computed(() => deviceState.value !== 'idle' || channelOpen.value)

  /**
   * 是否空闲
   */
  const isIdle = computed(() => deviceState.value === 'idle')

  /**
   * 是否正在监听
   */
  const isListening = computed(() => deviceState.value === 'listening')

  /**
   * 是否正在说话
   */
  const isSpeaking = computed(() => deviceState.value === 'speaking')

  /**
   * 更新状态
   * @param state - 应用状态快照
   */
  function updateState(state: AppStateSnapshot) {
    deviceState.value = state.deviceState
    channelOpen.value = state.channelOpen
  }

  /**
   * 更新表情
   * @param newEmotion - 新表情
   */
  function updateEmotion(newEmotion: string) {
    emotion.value = newEmotion
  }

  /**
   * 更新当前文本
   * @param text - 文本内容
   */
  function updateCurrentText(text: string) {
    currentText.value = text
  }

  /**
   * 添加消息
   * @param role - 角色
   * @param content - 内容
   */
  function addMessage(role: 'user' | 'assistant', content: string) {
    messages.value.push({
      role,
      content,
      timestamp: Date.now(),
    })
  }

  /**
   * 清空消息
   */
  function clearMessages() {
    messages.value = []
  }

  /**
   * 重置状态
   */
  function resetState() {
    deviceState.value = 'idle'
    channelOpen.value = false
    emotion.value = 'neutral'
    currentText.value = ''
  }

  return {
    // 状态
    deviceState,
    channelOpen,
    emotion,
    messages,
    currentText,

    // 计算属性
    isCalling,
    isIdle,
    isListening,
    isSpeaking,

    // 方法
    updateState,
    updateEmotion,
    updateCurrentText,
    addMessage,
    clearMessages,
    resetState,
  }
})
