<script setup lang="ts">
import type { EmotionType } from '../types/emotion'
import { NButton } from 'naive-ui'
import { watch } from 'vue'
import Dots from '../components/Dots.vue'
import TitleBar from '../components/TitleBar.vue'
import { useEmotion } from '../composables/useEmotion'
import { useAppStore } from '../stores/app'

const platform = window.electron.process.platform
const showTitleBar = platform !== 'darwin'

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
    if (appStore.isAutoMode) {
      // 挂断电话 - 停止自动对话
      console.log('挂断电话')
      await appStore.stopAutoConversation()
    }
    else {
      // 拨打电话 - 开始自动对话
      console.log('拨打电话')
      await appStore.startAutoConversation()
    }
  }
  catch (error) {
    console.error('切换通话状态失败', error)
  }
}
</script>

<template>
  <div class="flex flex-col w-full h-screen bg-white dark:bg-gray-900 overflow-hidden">
    <TitleBar v-if="showTitleBar" />
    <div v-else class="h-7 shrink-0" style="-webkit-app-region: drag" />

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
        :class="[appStore.isCalling ? 'visible' : 'collapse']"
      >
        <n-marquee v-if="appStore.currentText">
          {{ appStore.currentText }}
        </n-marquee>
        <template v-else>
          请开始说话
        </template>
      </div>

      <!-- Dots 组件 + 按钮组：固定相距 100px -->
      <div class="flex flex-col items-center gap-y-[100px] mt-12">
        <Dots :is-show="appStore.isCalling" />
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
