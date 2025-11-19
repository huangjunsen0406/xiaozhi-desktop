<script setup lang="ts">
import { NButton } from 'naive-ui'
import Dots from '../components/Dots.vue'
import { useCallStore } from '../stores/call'

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

// 使用通话状态 Store
const callStore = useCallStore()

// 切换通话状态（拨打/挂断）
async function toggleCall() {
  try {
    if (callStore.isCalling) {
      // 挂断电话 - 停止自动对话
      console.log('[MainView] 挂断电话')
      await window.api.appStopAutoConversation()
    }
    else {
      // 拨打电话 - 开始自动对话
      console.log('[MainView] 拨打电话')
      await window.api.appStartAutoConversation()
    }
  }
  catch (error) {
    console.error('[MainView] 切换通话状态失败:', error)
  }
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
    <div class="text-base text-gray-700 dark:text-gray-300" :class="[callStore.isCalling ? 'visible' : 'collapse']">
      请开始说话
    </div>

    <!-- Dots 组件 + 按钮组：固定相距 100px -->
    <div class="flex flex-col items-center gap-y-[100px] mt-12">
      <Dots :is-show="callStore.isCalling" />
      <div class="flex items-center gap-2">
        <!-- 电话按钮：点击拨打/挂断 -->
        <NButton quaternary circle @click="toggleCall">
          <icon-carbon-phone v-if="!callStore.isCalling" class="w-5 h-5 text-green-500" />
          <icon-carbon-phone-block-filled v-else class="w-5 h-5 text-red-500" />
        </NButton>
        <NButton quaternary circle @click="togglePanel">
          <icon-carbon-send-alt class="w-5 h-5" />
        </NButton>
      </div>
    </div>
  </div>
</template>
