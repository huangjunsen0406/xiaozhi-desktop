<script setup lang="ts">
import { NButton } from 'naive-ui'
import { ref } from 'vue'

import AudioWave from '../components/AudioWave.vue'

// Mock Data for History
const historyList = ref([
  { id: 1, title: '图片生成需求', active: true },
  { id: 2, title: '生成特定风格图片', active: false },
  { id: 3, title: '生成特定风格透明 PNG', active: false },
  { id: 4, title: '生成特定风格透明图片', active: false },
  { id: 5, title: '生成特定风格图片', active: false },
  { id: 6, title: '生成特定风格图片', active: false },
  { id: 7, title: '生成特定风格透明 PNG 图', active: false },
  { id: 8, title: '日常问候', active: false },
])

// Mock Data for Messages
const messages = ref([
  {
    id: 1,
    role: 'user',
    content: '你好',
  },
  {
    id: 2,
    role: 'assistant',
    content: '你好呀！😊 看你之前有批量生成风格统一的标准化图片素材需求，是准备继续推进相关项目，还是有新的图片生成需求要沟通呀？可以具体说说你的需求（比如参考图、清单、技术参数等），我会严格按照你的规范来执行~',
  },
])

const inputValue = ref('')
const isRecording = ref(false)

function toggleRecording() {
  isRecording.value = !isRecording.value
}

const isSidebarOpen = ref(true)
function toggleSidebar() {
  isSidebarOpen.value = !isSidebarOpen.value
}
</script>

<template>
  <div class="flex w-full h-screen overflow-hidden bg-white dark:bg-gray-900 font-sans">
    <!-- Sidebar -->
    <!-- Sidebar -->
    <div
      class="flex-shrink-0 bg-[#F7F7F7] dark:bg-gray-800 flex flex-col border-r border-gray-100 dark:border-gray-700 transition-all duration-300 ease-in-out overflow-hidden"
      :class="[isSidebarOpen ? 'w-64' : 'w-[68px]']"
    >
      <!-- Drag Region (Top Left) -->
      <div class="h-10 w-full" style="-webkit-app-region: drag" />

      <!-- Sidebar Header -->
      <div class="px-4 pb-2 flex items-center justify-between text-xs font-medium text-gray-400 whitespace-nowrap">
        <span :class="{ 'opacity-0': !isSidebarOpen }">历史对话</span>
      </div>

      <!-- History List -->
      <div class="flex-1 overflow-y-auto px-2 space-y-1">
        <div
          v-for="item in historyList"
          :key="item.id"
          class="group flex items-center gap-2 px-3 py-2 text-sm rounded-lg cursor-pointer transition-colors whitespace-nowrap"
          :class="[
            item.active
              ? 'bg-gray-200/60 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50',
          ]"
        >
          <icon-carbon-chat class="w-4 h-4 flex-shrink-0 opacity-70" />
          <span class="truncate flex-1" :class="{ 'opacity-0': !isSidebarOpen }">{{ item.title }}</span>
          <icon-carbon-overflow-menu-horizontal
            v-if="item.active"
            class="w-4 h-4 opacity-50 hover:opacity-100"
            :class="{ 'opacity-0': !isSidebarOpen }"
          />
        </div>
      </div>

      <!-- Sidebar Footer (Toggle Button) -->
      <div class="p-4 flex items-center" :class="[isSidebarOpen ? 'justify-end' : 'justify-center']">
        <NButton quaternary circle size="small" @click="toggleSidebar">
          <icon-carbon-side-panel-close v-if="isSidebarOpen" class="w-4 h-4 text-gray-500" />
          <icon-carbon-side-panel-open v-else class="w-4 h-4 text-gray-500" />
        </NButton>
      </div>
    </div>

    <!-- Main Chat Area -->
    <div class="flex-1 flex flex-col relative bg-white dark:bg-gray-900">
      <!-- Drag Region (Top Right) -->
      <div class="h-10 w-full flex-shrink-0" style="-webkit-app-region: drag" />

      <!-- Messages Area -->
      <div class="flex-1 overflow-y-auto px-20 py-4">
        <div v-for="msg in messages" :key="msg.id" class="mb-8 flex flex-col">
          <!-- User Message -->
          <div v-if="msg.role === 'user'" class="self-end max-w-[80%]">
            <div class="bg-[#F3F3F3] dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm leading-relaxed">
              {{ msg.content }}
            </div>
          </div>

          <!-- Assistant Message -->
          <div v-else class="self-start max-w-[80%]">
            <div class="text-gray-900 dark:text-gray-100 text-sm leading-relaxed">
              {{ msg.content }}
            </div>
          </div>
        </div>
      </div>

      <!-- Input Area -->
      <div class="px-20 pb-8 pt-2">
        <div class="relative bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-3xl shadow-sm hover:shadow-md transition-shadow duration-200">
          <textarea
            v-model="inputValue"
            placeholder="发消息或输入 / 选择技能"
            class="w-full min-h-[56px] max-h-[200px] py-4 px-5 bg-transparent border-none outline-none resize-none text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400"
            rows="1"
          />

          <!-- Input Actions -->
          <div class="flex items-center justify-end gap-2 px-4 pb-3">
            <NButton quaternary circle size="small" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <icon-carbon-phone class="w-4 h-4" />
            </NButton>
            <NButton
              quaternary
              circle
              size="small"
              class="transition-colors duration-200"
              :class="[isRecording ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300']"
              @click="toggleRecording"
            >
              <AudioWave v-if="isRecording" :active="true" class="w-4 h-4" />
              <icon-carbon-microphone v-else class="w-4 h-4" />
            </NButton>
            <NButton
              circle
              size="small"
              class="bg-[#E5E5E5] dark:bg-gray-700 text-white dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 border-none"
              :disabled="!inputValue"
            >
              <icon-carbon-arrow-up class="w-4 h-4" />
            </NButton>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Custom Scrollbar for Sidebar */
::-webkit-scrollbar {
  width: 0px;
  background: transparent;
}
</style>
