<script setup lang="ts">
import type { EmotionType } from '../types/emotion'
import { NButton, NMarquee } from 'naive-ui'
import { watch } from 'vue'
import Dots from '../components/Dots.vue'
import { useEmotion } from '../composables/useEmotion'
import { useAppStore } from '../stores/app'

const platform = window.electron.process.platform
const isMac = platform === 'darwin'

// 使用全局 App Store
const appStore = useAppStore()

// 表情管理
const emotion = useEmotion({
  defaultEmotion: 'neutral',
})

// 监听 store 中的表情变化并同步到 emotion
watch(() => appStore.emotion, (newEmotion) => {
  emotion.setEmotion(newEmotion as EmotionType)
}, { immediate: true })

// 切换通话状态（拨打/挂断）
async function toggleCall() {
  try {
    // 只要不是 idle 状态就挂断（包括 connecting、listening、speaking）
    if (appStore.deviceState !== 'idle') {
      console.log('挂断电话')
      await appStore.stopAutoConversation()
    }
    else {
      console.log('拨打电话')
      await appStore.startAutoConversation()
    }
  }
  catch (error) {
    console.error('切换通话状态失败', error)
  }
}

// 打开设置
function toggleSettings() {
  window.api.toggleSettings()
}
</script>

<template>
  <div class="relative flex flex-col w-full h-screen bg-white dark:bg-gray-900 overflow-hidden">
    <!-- 顶部拖拽区域 + 设置按钮 -->
    <div class="flex items-center justify-between h-8 px-2 shrink-0" style="-webkit-app-region: drag">
      <!-- macOS 红绿灯占位 -->
      <div v-if="isMac" class="w-16" />
      <div v-else class="flex-1" />

      <!-- 右上角设置按钮 -->
      <button
        class="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition text-gray-500 dark:text-gray-400"
        style="-webkit-app-region: no-drag"
        type="button"
        aria-label="设置"
        @click="toggleSettings"
      >
        <icon-carbon-settings class="w-4 h-4" />
      </button>
    </div>

    <div class="relative flex flex-col items-center justify-center flex-1 gap-4 p-5 overflow-hidden" style="-webkit-app-region: no-drag">
      <!-- 表情头像 -->
      <img
        :src="emotion.imageUrl.value"
        :alt="emotion.emotion.value"
        class="w-[72px] h-[72px] rounded-[28px] object-cover mt-12 transition-opacity duration-300"
      >

      <!-- 标题 - 显示 AI 回复或提示文本 -->
      <div
        class="text-base text-gray-700 dark:text-gray-300 text-center px-4 max-w-md"
      >
        <NMarquee v-if="appStore.currentText">
          {{ appStore.currentText }}
        </NMarquee>
        <template v-else-if="appStore.isCalling && !appStore.currentText">
          请开始说话
        </template>
      </div>

      <!-- Dots 组件 + 按钮组：固定相距 100px -->
      <div class="flex flex-col items-center gap-y-[100px] mt-12">
        <Dots :is-show="appStore.isCalling && !appStore.currentText" />
        <div class="flex items-center gap-2" style="-webkit-app-region: no-drag">
          <!-- 电话按钮：点击拨打/挂断 -->
          <NButton quaternary circle @click="toggleCall">
            <icon-carbon-phone v-if="appStore.deviceState === 'idle'" class="w-5 h-5 text-green-500" />
            <icon-carbon-phone-block-filled v-else class="w-5 h-5 text-red-500" />
          </NButton>
        </div>
      </div>
    </div>
  </div>
</template>
