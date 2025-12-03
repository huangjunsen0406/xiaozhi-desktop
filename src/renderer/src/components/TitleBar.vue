<script setup lang="ts">
import IconCarbonClose from '~icons/carbon/close'
import IconCarbonMaximize from '~icons/carbon/maximize'
import IconCarbonSubtract from '~icons/carbon/subtract'
// import logo from '../assets/icon.png'

withDefaults(defineProps<{ title?: string }>(), {
  title: '小智桌面',
})

// const platform = window.electron.process.platform
// const isMac = platform === 'darwin'
// const isWindows = platform === 'win32'

function handleMinimize(): void {
  window.api.minimize()
}

function handleToggleMaximize(): void {
  window.api.toggleMaximize()
}

function handleClose(): void {
  window.api.close()
}
</script>

<template>
  <!-- Windows/Linux 样式 - 只在非 macOS 显示 -->
  <div
    class="flex items-center justify-between h-8 px-2 select-none bg-white dark:bg-gray-900"
    style="-webkit-app-region: drag"
  >
    <!-- 左侧：空白占位 -->
    <div class="flex-1" />

    <!-- 右侧：Windows 风格按钮 -->
    <div class="flex items-center" style="-webkit-app-region: no-drag">
      <button
        class="w-12 h-8 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition text-gray-700 dark:text-gray-200"
        type="button"
        aria-label="minimize"
        @click="handleMinimize"
      >
        <IconCarbonSubtract class="w-3.5 h-3.5" />
      </button>
      <button
        class="w-12 h-8 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition text-gray-700 dark:text-gray-200"
        type="button"
        aria-label="maximize"
        @click="handleToggleMaximize"
      >
        <IconCarbonMaximize class="w-3.5 h-3.5" />
      </button>
      <button
        class="w-12 h-8 flex items-center justify-center hover:bg-red-600 hover:text-white transition text-gray-700 dark:text-gray-200"
        type="button"
        aria-label="close"
        @click="handleClose"
      >
        <IconCarbonClose class="w-3.5 h-3.5" />
      </button>
    </div>
  </div>
</template>
