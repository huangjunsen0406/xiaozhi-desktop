<script setup lang="ts">
import { useColorMode } from '@vueuse/core'
import { NButton, NDropdown } from 'naive-ui'
import { computed } from 'vue'

function minimize(): void {
  window.api.toggleToMini()
}

function togglePanel(): void {
  window.api.togglePanel()
}

// Frameless 窗口控制（Linux 无原生按钮时使用）
const platform = window.electron.process.platform
function winMinimize(): void {
  window.api.minimize()
}
function winToggleMaximize(): void {
  window.api.toggleMaximize()
}
function winClose(): void {
  window.api.close()
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
      return '🌙 '
    case 'light':
      return '☀️ '
    default:
      return '💻 '
  }
})

// 是否通话中
const isCalling = ref(true)

// 处理主题选择
function handleThemeSelect(key: string) {
  mode.value = key as 'light' | 'dark' | 'auto'
}
</script>

<template>
  <div
    class="relative flex flex-col items-center justify-center w-full h-screen gap-4 p-5 overflow-hidden bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950"
  >
    <!-- 标题栏拖拽区域 -->
    <div class="fixed top-0 left-0 right-0 h-10" style="-webkit-app-region: drag">
      <div class="h-full" />
    </div>

    <!-- 主题切换下拉菜单（右上角） -->
    <div class="absolute top-3 right-3 z-10" style="-webkit-app-region: no-drag">
      <NDropdown trigger="click" :options="themeOptions" @select="handleThemeSelect">
        <NButton quaternary>
          {{ currentThemeText }}
        </NButton>
      </NDropdown>
    </div>

    <!-- Linux 自定义窗口控制按钮（Win 有原生 overlay，不重复渲染） -->
    <div
      v-if="platform === 'linux'"
      class="absolute top-1 right-2 z-20 flex items-center gap-1"
      style="-webkit-app-region: no-drag"
    >
      <NButton quaternary circle size="small" @click="winMinimize">
        <icon-carbon-subtract class="w-4 h-4" />
      </NButton>
      <NButton quaternary circle size="small" @click="winToggleMaximize">
        <icon-carbon-maximize class="w-4 h-4" />
      </NButton>
      <NButton quaternary circle size="small" @click="winClose">
        <icon-carbon-close class="w-4 h-4" />
      </NButton>
    </div>

    <!-- Logo -->
    <img
      src="../assets/icon.png" alt="robot"
      class="w-[72px] h-[72px] rounded-[28px] object-cover mt-12"
    >

    <!-- 标题 -->
    <div class="text-base text-gray-700 dark:text-gray-300">
      请开始说话
    </div>

    <!-- Dots 组件 + 按钮组：固定相距 100px -->
    <div class="flex flex-col items-center gap-y-[100px] mt-12">
      <Dots />
      <div class="flex items-center gap-2">
        <!-- <iconify-icon icon="carbon:phone" width="32" height="32" /> -->

        <NButton quaternary circle @click="minimize">
          <icon-carbon-phone v-if="!isCalling" class="w-5 h-5 text-green-500" />
          <icon-carbon-phone-block-filled v-else class="w-5 h-5 text-red-500" />
        </NButton>
        <NButton quaternary circle @click="togglePanel">
          <icon-carbon-send-alt class="w-5 h-5" />
        </NButton>
      </div>
    </div>
  </div>
</template>
