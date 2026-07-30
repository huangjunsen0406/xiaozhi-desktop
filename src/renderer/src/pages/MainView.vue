<script setup lang="ts">
import type { EmotionType } from '../types/emotion'
import { NButton, NMarquee } from 'naive-ui'
import { watch } from 'vue'
import Dots from '../components/Dots.vue'
import { useEmotion } from '../composables/useEmotion'
import { useAppStore } from '../stores/app'

const platform = window.api.getPlatform()
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
</script>

<template>
  <div class="relative flex flex-col w-full h-screen bg-white dark:bg-gray-900 overflow-hidden">
    <!-- 顶部拖拽区域 -->
    <div class="flex items-center justify-between h-8 px-2 shrink-0" style="-webkit-app-region: drag">
      <!-- macOS 红绿灯占位 -->
      <div v-if="isMac" class="w-16" />
      <div v-else class="flex-1" />
    </div>

    <div class="relative flex flex-col items-center flex-1 p-5 overflow-hidden" style="-webkit-app-region: no-drag">
      <!-- 占位，把主体内容往下推 -->
      <div class="h-16" />

      <!-- 表情头像 -->
      <img
        :src="emotion.imageUrl.value"
        :alt="emotion.emotion.value"
        class="w-[72px] h-[72px] rounded-[28px] object-cover transition-opacity duration-300"
      >

      <!-- 绝对定位的文本区域，不参与 flex 布局挤压 -->
      <div class="absolute top-[210px] w-full px-8 flex justify-center pointer-events-none">
        <div class="text-base text-gray-700 dark:text-gray-300 text-center max-w-md h-6 flex items-center justify-center">
          <NMarquee v-if="appStore.currentText" class="pointer-events-auto">
            {{ appStore.currentText }}
          </NMarquee>
          <span v-else-if="appStore.isCalling && !appStore.currentText">
            请开始说话
          </span>
        </div>
      </div>

      <!-- 绝对定位的 Dots 组件，不参与 flex 布局挤压 -->
      <div class="absolute top-[250px] w-full flex justify-center pointer-events-none">
        <Dots :is-show="appStore.isCalling && !appStore.currentText" />
      </div>

      <!-- 占据剩余空间，将底部按钮推到固定位置 -->
      <div class="flex-1" />

      <!-- 底部按钮区域 -->
      <div class="flex flex-col items-center mb-8">
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
