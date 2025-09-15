<script setup lang="ts">
import { useColorMode } from '@vueuse/core'
import { NButton, NDropdown } from 'naive-ui'
import { computed } from 'vue'

function minimize(): void {
  window.electron?.ipcRenderer?.send('toggle-to-mini')
}

// 使用 useColorMode 支持 auto、dark、light 三种模式
const mode = useColorMode({
  selector: 'html',
  attribute: 'class',
  modes: {
    light: 'light',
    dark: 'dark',
    auto: '', // auto 模式时不添加 class，由系统决定
  },
})

// 主题选项
const themeOptions = [
  {
    label: '浅色主题',
    key: 'light',
  },
  {
    label: '深色主题',
    key: 'dark',
  },
  {
    label: '跟随系统',
    key: 'auto',
  },
]

// 当前主题文本
const currentThemeText = computed(() => {
  switch (mode.value) {
    case 'dark':
      return '🌙 深色主题'
    case 'light':
      return '☀️ 浅色主题'
    default:
      return '💻 跟随系统'
  }
})

// 处理主题选择
function handleThemeSelect(key: string) {
  mode.value = key as 'light' | 'dark' | 'auto'
}
</script>

<template>
  <div class="relative flex flex-col items-center justify-center w-full h-screen gap-4 p-5 overflow-hidden bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950">
    <!-- 标题栏拖拽区域 -->
    <div class="fixed top-0 left-0 right-0 h-10" style="-webkit-app-region: drag">
      <div class="h-full" />
    </div>

    <!-- 背景装饰 -->
    <div class="absolute inset-0 pointer-events-none opacity-35 dark:opacity-20">
      <div class="absolute inset-0 bg-[url('../assets/wavy-lines.svg')] bg-no-repeat bg-left bg-center" style="background-size: 80% auto; background-position: left 40% center;" />
    </div>

    <!-- 主题切换下拉菜单（右上角） -->
    <div class="absolute top-3 right-3 z-10">
      <NDropdown
        trigger="click"
        :options="themeOptions"
        @select="handleThemeSelect"
      >
        <NButton quaternary>
          {{ currentThemeText }}
        </NButton>
      </NDropdown>
    </div>

    <!-- Logo -->
    <img
      src="../assets/icon.png"
      alt="robot"
      class="w-[72px] h-[72px] rounded-[28px] object-cover mt-12 shadow-2xl dark:shadow-black/50"
    >

    <!-- 标题 -->
    <div class="text-base text-gray-700 dark:text-gray-300">
      请开始说话
    </div>

    <!-- 测试按钮 -->
    <NButton type="primary">
      Primary
    </NButton>

    <!-- Dots 组件 -->
    <Dots />

    <!-- 收起按钮 -->
    <NButton type="primary" @click="minimize">
      收起
    </NButton>
  </div>
</template>

<style scoped>
/* 保留必要的特殊样式 */
</style>
