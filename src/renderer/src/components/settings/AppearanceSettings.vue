<script setup lang="ts">
import type { DisplayMode } from '@shared/types'
import type { SettingsPanelHandle } from '../../types/settings'
import {
  PET_DISPLAY_WIDTH_DEFAULT,
  PET_DISPLAY_WIDTH_MAX,
  PET_DISPLAY_WIDTH_MIN,
} from '@shared/types'
import { useColorMode } from '@vueuse/core'
import { NForm, NFormItem, NSelect, NSlider, useMessage } from 'naive-ui'
import { onMounted, onUnmounted, ref } from 'vue'

const message = useMessage()

const mode = useColorMode({
  selector: 'html',
  attribute: 'class',
  emitAuto: true,
  modes: {
    light: 'light',
    dark: 'dark',
    auto: '',
  },
})

const displayMode = ref<DisplayMode>('main')
const displayWidthPx = ref(PET_DISPLAY_WIDTH_DEFAULT)
const sizeSaving = ref(false)
let sizeDebounceTimer: ReturnType<typeof setTimeout> | null = null
const cleanups: Array<() => void> = []

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

async function handleDisplayModeChange(value: DisplayMode) {
  try {
    await window.api.switchDisplayMode(value)
  }
  catch {
    // 切换失败静默处理
  }
}

async function persistDisplayWidth(width: number): Promise<void> {
  if (sizeSaving.value)
    return
  sizeSaving.value = true
  try {
    displayWidthPx.value = await window.api.petsSetDisplayWidth(width)
  }
  catch {
    message.error('设置宠物大小失败')
  }
  finally {
    sizeSaving.value = false
  }
}

function handleDisplayWidthInput(width: number): void {
  displayWidthPx.value = width
  if (sizeDebounceTimer)
    clearTimeout(sizeDebounceTimer)
  sizeDebounceTimer = setTimeout(() => {
    void persistDisplayWidth(width)
  }, 200)
}

onMounted(async () => {
  try {
    displayMode.value = await window.api.getDisplayMode()
  }
  catch {
    // 保持默认值
  }

  try {
    displayWidthPx.value = await window.api.petsGetDisplayWidth()
  }
  catch {
    // 保持默认值
  }

  cleanups.push(
    window.api.onDisplayModeChanged((next) => {
      displayMode.value = next
    }),
    window.api.petsOnDisplayWidthChanged((width) => {
      displayWidthPx.value = width
    }),
  )
})

onUnmounted(() => {
  if (sizeDebounceTimer) {
    clearTimeout(sizeDebounceTimer)
    sizeDebounceTimer = null
  }
  while (cleanups.length)
    cleanups.pop()?.()
})

const panel = {
  persistence: 'immediate',
} satisfies SettingsPanelHandle

defineExpose(panel)
</script>

<template>
  <div class="min-h-0">
    <NForm label-placement="left" :label-width="120">
      <NFormItem label="显示模式">
        <NSelect
          v-model:value="displayMode"
          :options="displayModeOptions"
          placeholder="选择显示模式"
          @update:value="handleDisplayModeChange"
        />
      </NFormItem>

      <NFormItem label="主题">
        <NSelect
          v-model:value="mode"
          :options="themeOptions"
          placeholder="选择主题"
        />
      </NFormItem>

      <NFormItem label="宠物大小">
        <div style="display: flex; flex-direction: column; gap: 4px; width: 100%">
          <NSlider
            :value="displayWidthPx"
            :min="PET_DISPLAY_WIDTH_MIN"
            :max="PET_DISPLAY_WIDTH_MAX"
            :step="1"
            @update:value="handleDisplayWidthInput"
          />
          <span style="color: #999; font-size: 12px">
            当前宽度: {{ displayWidthPx }}px（{{ PET_DISPLAY_WIDTH_MIN }}–{{ PET_DISPLAY_WIDTH_MAX }}，默认 {{ PET_DISPLAY_WIDTH_DEFAULT }}）
          </span>
        </div>
      </NFormItem>
    </NForm>
  </div>
</template>
