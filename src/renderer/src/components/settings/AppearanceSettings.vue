<script setup lang="ts">
import {
  PET_DISPLAY_WIDTH_DEFAULT,
  PET_DISPLAY_WIDTH_MAX,
  PET_DISPLAY_WIDTH_MIN,
} from '@shared/types'
import { useColorMode } from '@vueuse/core'
import { NForm, NFormItem, NSelect, NSlider, useMessage } from 'naive-ui'
import { onMounted, onUnmounted, ref, watch } from 'vue'

const message = useMessage()

const mode = useColorMode({
  selector: 'html',
  attribute: 'class',
  emitAuto: true,
  modes: {
    light: 'light',
    dark: 'dark',
    auto: 'auto',
  },
})

const displayMode = ref<'main' | 'mini' | 'chat' | 'live2d' | 'pets'>('main')

// 全局桌宠显示宽度（Sprite + Live2D 共用，Codex 80–224 默认 112）
const displayWidthPx = ref(PET_DISPLAY_WIDTH_DEFAULT)
const sizeSaving = ref(false)
let sizeDebounceTimer: ReturnType<typeof setTimeout> | null = null
let removeDisplayWidthListener: (() => void) | null = null
let removeDisplayModeListener: (() => void) | null = null
/** 避免本地 set 后广播回写再触发保存 */
let suppressSizeWatch = false

// 选项定义
const displayModeOptions = [
  { label: '标准窗口', value: 'main' },
  { label: '迷你悬浮球', value: 'mini' },
  { label: '聊天视图', value: 'chat' },
  { label: 'Live2D 桌面宠物', value: 'live2d' },
  { label: '精灵宠物', value: 'pets' },
]

const themeOptions = [
  { label: '浅色', value: 'light' },
  { label: '深色', value: 'dark' },
  { label: '跟随系统', value: 'auto' },
]

async function handleDisplayModeChange(value: 'main' | 'mini' | 'chat' | 'live2d' | 'pets') {
  try {
    await window.api.switchDisplayMode(value)
  }
  catch {
    // 切换失败静默处理
  }
}

function handleThemeChange(value: 'light' | 'dark' | 'auto') {
  mode.value = value
}

/**
 * 持久化显示宽度（防抖）；主进程会广播给已打开的 pets/live2d 窗
 */
async function persistDisplayWidth(width: number): Promise<void> {
  if (sizeSaving.value)
    return
  sizeSaving.value = true
  try {
    const saved = await window.api.petsSetDisplayWidth(width)
    suppressSizeWatch = true
    displayWidthPx.value = saved
    suppressSizeWatch = false
  }
  catch {
    message.error('设置宠物大小失败')
  }
  finally {
    sizeSaving.value = false
  }
}

watch(displayWidthPx, (width) => {
  if (suppressSizeWatch)
    return
  if (sizeDebounceTimer)
    clearTimeout(sizeDebounceTimer)
  sizeDebounceTimer = setTimeout(() => {
    void persistDisplayWidth(width)
  }, 200)
})

onMounted(async () => {
  try {
    const mode = await window.api.getDisplayMode()
    displayMode.value = mode
  }
  catch {
    // 加载失败时保持默认值
  }

  try {
    const width = await window.api.petsGetDisplayWidth()
    suppressSizeWatch = true
    displayWidthPx.value = width
    suppressSizeWatch = false
  }
  catch {
    // 加载失败时保持默认值
  }

  removeDisplayModeListener = window.api.onDisplayModeChanged((mode) => {
    displayMode.value = mode
  })

  removeDisplayWidthListener = window.api.petsOnDisplayWidthChanged((width) => {
    if (width === displayWidthPx.value)
      return
    suppressSizeWatch = true
    displayWidthPx.value = width
    suppressSizeWatch = false
  })
})

onUnmounted(() => {
  if (sizeDebounceTimer) {
    clearTimeout(sizeDebounceTimer)
    sizeDebounceTimer = null
  }
  if (removeDisplayWidthListener) {
    removeDisplayWidthListener()
    removeDisplayWidthListener = null
  }
  if (removeDisplayModeListener) {
    removeDisplayModeListener()
    removeDisplayModeListener = null
  }
})

defineExpose({
  handleSave: async () => {
    if (sizeDebounceTimer) {
      clearTimeout(sizeDebounceTimer)
      sizeDebounceTimer = null
      await persistDisplayWidth(displayWidthPx.value)
    }
    message.success('外观设置已保存')
  },
})
</script>

<template>
  <div class="min-h-0">
    <NForm label-placement="left" :label-width="120">
      <!-- 显示模式 -->
      <NFormItem label="显示模式">
        <NSelect
          v-model:value="displayMode"
          :options="displayModeOptions"
          placeholder="选择显示模式"
          @update:value="handleDisplayModeChange"
        />
      </NFormItem>

      <!-- 主题设置 -->
      <NFormItem label="主题">
        <NSelect
          v-model:value="mode"
          :options="themeOptions"
          placeholder="选择主题"
          @update:value="handleThemeChange"
        />
      </NFormItem>

      <!-- 宠物大小（Sprite Pets + Live2D 共用） -->
      <NFormItem label="宠物大小">
        <div style="display: flex; flex-direction: column; gap: 4px; width: 100%">
          <NSlider
            v-model:value="displayWidthPx"
            :min="PET_DISPLAY_WIDTH_MIN"
            :max="PET_DISPLAY_WIDTH_MAX"
            :step="1"
          />
          <span style="color: #999; font-size: 12px">
            当前宽度: {{ displayWidthPx }}px（{{ PET_DISPLAY_WIDTH_MIN }}–{{ PET_DISPLAY_WIDTH_MAX }}，默认 {{ PET_DISPLAY_WIDTH_DEFAULT }}）
          </span>
        </div>
      </NFormItem>
    </NForm>
  </div>
</template>
