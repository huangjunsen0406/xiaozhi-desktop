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
 * 通话状态 Store
 * 用于在多个窗口间同步通话状态
 */
export const useCallStore = defineStore('call', () => {
  // 设备状态
  const deviceState = ref<DeviceState>('idle')

  // 音频通道是否打开
  const channelOpen = ref(false)

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
   * 重置状态
   */
  function resetState() {
    deviceState.value = 'idle'
    channelOpen.value = false
  }

  return {
    // 状态
    deviceState,
    channelOpen,

    // 计算属性
    isCalling,
    isIdle,
    isListening,
    isSpeaking,

    // 方法
    updateState,
    resetState,
  }
})
