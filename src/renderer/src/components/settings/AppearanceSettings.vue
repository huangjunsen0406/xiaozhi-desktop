<script setup lang="ts">
import { useColorMode } from '@vueuse/core'
import { NForm, NFormItem, NSelect } from 'naive-ui'
import { ref } from 'vue'

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

const displayMode = ref<'main' | 'mini'>('main')

// 选项定义
const displayModeOptions = [
  { label: '标准窗口', value: 'main' },
  { label: '迷你悬浮球', value: 'mini' },
]

const themeOptions = [
  { label: '浅色', value: 'light' },
  { label: '深色', value: 'dark' },
  { label: '跟随系统', value: 'auto' },
]

async function handleDisplayModeChange(value: 'main' | 'mini') {
  try {
    // 立即切换显示模式
    await window.api.switchDisplayMode(value)
    console.log(`已切换到 ${value} 模式`)
  }
  catch (error) {
    console.error('切换显示模式失败:', error)
  }
}

function handleThemeChange(value: 'light' | 'dark' | 'auto') {
  mode.value = value
  console.log(`已切换到 ${value} 主题`)
}
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
    </NForm>
  </div>
</template>
