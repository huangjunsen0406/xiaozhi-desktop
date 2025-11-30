<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { convertEventToAccelerator, formatShortcutDisplay } from '../utils/shortcutFormatter'

interface Props {
  modelValue: string | null
  disabled?: boolean
}

interface Emits {
  (e: 'update:modelValue', value: string | null): void
  (e: 'conflict', name: string): void
  (e: 'error', message: string): void
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
})

const emit = defineEmits<Emits>()

const isRecording = ref(false)
const tempAccelerator = ref<string | null>(null)
const pendingTimer = ref<number | null>(null)
const abortController = ref<AbortController | null>(null)

function startRecording() {
  if (props.disabled)
    return
  isRecording.value = true
  tempAccelerator.value = null
}

function stopRecording() {
  isRecording.value = false
  tempAccelerator.value = null

  // Clear pending timer
  if (pendingTimer.value !== null) {
    clearTimeout(pendingTimer.value)
    pendingTimer.value = null
  }
}

async function handleKeyDown(e: KeyboardEvent) {
  if (!isRecording.value)
    return

  e.preventDefault()
  e.stopPropagation()

  // ESC 取消录制
  if (e.key === 'Escape') {
    stopRecording()
    return
  }

  const accelerator = convertEventToAccelerator(e)

  if (!accelerator) {
    // console.log('无效的快捷键组合')
    return
  }

  // Cancel previous request if exists
  if (abortController.value) {
    abortController.value.abort()
  }

  // Create new AbortController for this request
  abortController.value = new AbortController()

  try {
    // 检测冲突
    const result = await window.api.shortcutCheckConflict(accelerator)

    // Check if component is still recording (not unmounted)
    if (!isRecording.value) {
      return
    }

    if (result.conflict && result.name) {
      emit('conflict', result.name)
      stopRecording()
      return
    }

    // 保存
    emit('update:modelValue', accelerator)
    tempAccelerator.value = accelerator

    // 延迟关闭录制状态（让用户看到结果）
    pendingTimer.value = window.setTimeout(() => {
      if (isRecording.value) {
        stopRecording()
      }
    }, 300)
  }
  catch (error) {
    // Only handle error if component is still mounted
    if (isRecording.value) {
      console.error('冲突检测失败', error)
      emit('error', '快捷键冲突检测失败，请重试')
      stopRecording()
    }
  }
  finally {
    abortController.value = null
  }
}

onUnmounted(() => {
  if (pendingTimer.value !== null) {
    clearTimeout(pendingTimer.value)
    pendingTimer.value = null
  }

  // Abort any in-flight requests
  if (abortController.value) {
    abortController.value.abort()
    abortController.value = null
  }
})

function handleClear(e: MouseEvent) {
  e.stopPropagation()
  emit('update:modelValue', null)
}

const displayKeys = computed(() => {
  const rawValue = isRecording.value ? tempAccelerator.value : props.modelValue
  if (!rawValue)
    return []

  // 使用 formatShortcutDisplay 获取格式化后的文本，然后分割
  // formatShortcutDisplay 会把 + 替换为 ' + '
  const formatted = formatShortcutDisplay(rawValue)
  return formatted.split(' + ')
})

const placeholder = computed(() => {
  if (isRecording.value)
    return '请按下快捷键...'
  return '点击设置'
})

const showClearIcon = computed(() => {
  return props.modelValue && !isRecording.value && !props.disabled
})
</script>

<template>
  <div
    class="shortcut-recorder"
    :class="{
      recording: isRecording,
      disabled,
      active: !!modelValue || isRecording,
    }"
    tabindex="0"
    @keydown="handleKeyDown"
    @click="startRecording"
  >
    <div class="keys-container">
      <template v-if="displayKeys.length > 0">
        <span v-for="(key, index) in displayKeys" :key="index" class="key-cap">
          {{ key }}
        </span>
      </template>
      <span v-else class="placeholder">{{ placeholder }}</span>
    </div>

    <button
      v-if="showClearIcon"
      class="clear-btn"
      title="清除快捷键"
      @click="handleClear"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.shortcut-recorder {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 140px;
  height: 32px;
  padding: 0 8px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 6px;
  background-color: rgba(0, 0, 0, 0.02);
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
  box-sizing: border-box;
}

.shortcut-recorder:hover:not(.disabled) {
  background-color: rgba(0, 0, 0, 0.05);
  border-color: rgba(0, 0, 0, 0.15);
}

.shortcut-recorder.recording {
  background-color: #fff;
  border-color: var(--n-primary-color, #18a058);
  box-shadow: 0 0 0 2px rgba(24, 160, 88, 0.2);
}

.shortcut-recorder.disabled {
  opacity: 0.6;
  cursor: not-allowed;
  background-color: rgba(0, 0, 0, 0.04);
}

.keys-container {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  overflow: hidden;
}

.key-cap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  color: #333;
  background: #fff;
  border: 1px solid #d1d1d1;
  border-bottom-width: 2px;
  border-radius: 4px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
  white-space: nowrap;
}

.placeholder {
  font-size: 12px;
  color: #999;
}

.clear-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin-left: 6px;
  padding: 0;
  border: none;
  background: transparent;
  color: #999;
  cursor: pointer;
  border-radius: 50%;
  transition: all 0.2s;
}

.clear-btn:hover {
  color: #666;
  background-color: rgba(0,0,0,0.05);
}

/* Dark Mode Support */
.dark .shortcut-recorder {
  background-color: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.1);
}

.dark .shortcut-recorder:hover:not(.disabled) {
  background-color: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.2);
}

.dark .shortcut-recorder.recording {
  background-color: #1a1a1a;
  border-color: var(--n-primary-color, #63e2b7);
  box-shadow: 0 0 0 2px rgba(99, 226, 183, 0.2);
}

.dark .key-cap {
  background: #333;
  color: #eee;
  border-color: #555;
  box-shadow: 0 1px 2px rgba(0,0,0,0.2);
}

.dark .placeholder {
  color: #666;
}

.dark .clear-btn {
  color: #666;
}

.dark .clear-btn:hover {
  color: #999;
  background-color: rgba(255,255,255,0.1);
}
</style>
