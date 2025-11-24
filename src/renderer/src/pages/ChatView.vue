<script setup lang="ts">
import { NButton, NDropdown } from 'naive-ui'
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

import AudioWave from '../components/AudioWave.vue'
import { useServerMessage } from '../composables/useServerMessage'
import { useAppStore } from '../stores/app'
import { imageDataToDataURL } from '../utils/imageUtils'

// UI 状态
const inputValue = ref('')
const isRecording = ref(false)
const isSidebarOpen = ref(true)
const messagesContainer = ref<HTMLElement>()

// 使用全局 App Store
const appStore = useAppStore()

// 使用服务器消息处理（自动更新 store）
useServerMessage()

// 监听消息变化，自动滚动到底部
watch(
  () => appStore.messages.length,
  () => {
    nextTick(() => {
      scrollToBottom()
    })
  },
)

/**
 * 组件挂载
 */
onMounted(async () => {
  console.log('[ChatView] 组件已挂载')

  // 加载会话列表
  await appStore.loadSessions()

  // 自动切换到当前会话（如果有的话）
  if (appStore.currentSessionId) {
    console.log('[ChatView] 自动选中当前会话:', appStore.currentSessionId)
    await switchSession(appStore.currentSessionId)
  }
  else if (appStore.sessions.length > 0) {
    // 如果没有当前会话，选中第一个
    console.log('[ChatView] 自动选中第一个会话:', appStore.sessions[0].sessionId)
    await switchSession(appStore.sessions[0].sessionId)
  }
  else {
    // 如果没有任何会话，创建今天的会话
    const sessionId = await appStore.getTodaySession()
    console.log('[ChatView] 创建今天的会话:', sessionId)
    await appStore.switchSession(sessionId)
  }

  // 滚动到底部
  await nextTick()
  scrollToBottom()
})

/**
 * 组件卸载
 */
onUnmounted(() => {
  console.log('[ChatView] 组件卸载')
})


/**
 * 发送消息
 */
async function sendMessage() {
  const text = inputValue.value.trim()
  if (!text)
    return

  try {
    console.log('[ChatView] 发送消息:', text)

    // 确保有当前会话
    if (!appStore.currentSessionId) {
      const sessionId = await appStore.getTodaySession()
      await appStore.switchSession(sessionId)
    }

    // 添加用户消息到界面和数据库
    await appStore.addTextMessage(text)
    inputValue.value = ''

    // 滚动到底部
    await nextTick()
    scrollToBottom()

    // 发送到服务器
    await appStore.sendTextViaAudio(text)
  }
  catch (error) {
    console.error('[ChatView] 发送消息失败:', error)
  }
}

/**
 * 开启新对话
 */
async function startNewConversation() {
  const newSessionId = await appStore.createNewSession()

  if (newSessionId) {
    console.log('[ChatView] 创建新对话:', newSessionId)

    // 滚动到底部
    await nextTick()
    scrollToBottom()
  }
}

/**
 * 切换会话
 */
async function switchSession(sessionId: string) {
  await appStore.switchSession(sessionId)

  // 滚动到底部
  await nextTick()
  scrollToBottom()

  console.log('[ChatView] 会话已切换，消息数:', appStore.messages.length)
}

/**
 * 删除会话
 */
async function deleteSession(sessionId: string) {
  await appStore.deleteSession(sessionId)

  // 滚动到底部
  await nextTick()
  scrollToBottom()

  console.log('[ChatView] 会话已删除')
}

/**
 * 滚动到底部
 */
function scrollToBottom() {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

/**
 * 显示图片（从二进制数据转为 data URL）
 */
function getImageUrl(imageData: Uint8Array | any): string {
  return imageDataToDataURL(imageData)
}

/**
 * 切换录音状态
 */
function toggleRecording() {
  isRecording.value = !isRecording.value
}

/**
 * 切换侧边栏
 */
function toggleSidebar() {
  isSidebarOpen.value = !isSidebarOpen.value
}

/**
 * 处理回车发送
 */
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    sendMessage()
  }
}
</script>

<template>
  <div class="flex w-full h-screen overflow-hidden bg-white dark:bg-gray-900 font-sans">
    <!-- Sidebar -->
    <div
      class="flex-shrink-0 bg-[#F7F7F7] dark:bg-gray-800 flex flex-col border-r border-gray-100 dark:border-gray-700 transition-all duration-300 ease-in-out overflow-hidden"
      :class="[isSidebarOpen ? 'w-64' : 'w-[68px]']"
    >
      <!-- Drag Region (Top Left) -->
      <div class="h-10 w-full" style="-webkit-app-region: drag" />

      <!-- Sidebar Header -->
      <div class="px-4 pb-2 text-xs font-medium text-gray-400 whitespace-nowrap">
        <span :class="{ 'opacity-0': !isSidebarOpen }">历史对话</span>
      </div>

      <!-- History List (Grouped by Date) -->
      <div class="flex-1 overflow-y-auto px-2 space-y-3">
        <div v-for="group in appStore.groupedSessions" :key="group.date" class="space-y-1">
          <!-- Date Header -->
          <div
            class="px-3 py-1 text-xs font-medium text-gray-500 dark:text-gray-400"
            :class="{ 'opacity-0': !isSidebarOpen }"
          >
            {{ group.date }}
          </div>
          <!-- Sessions in this group -->
          <div
            v-for="item in group.sessions"
            :key="item.id"
            class="group flex items-center gap-2 px-3 py-2 text-sm rounded-lg cursor-pointer transition-colors whitespace-nowrap relative"
            :class="[
              item.active
                ? 'bg-gray-200/60 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50',
            ]"
            @click="switchSession(item.sessionId)"
          >
            <icon-carbon-chat class="w-4 h-4 flex-shrink-0 opacity-70" />
            <span class="truncate flex-1" :class="{ 'opacity-0': !isSidebarOpen }">{{ item.title }}</span>
            <NDropdown
              v-if="item.active && isSidebarOpen"
              trigger="click"
              :options="[
                { label: '删除对话', key: 'delete' },
              ]"
              @select="(key: string) => key === 'delete' && deleteSession(item.sessionId)"
            >
              <icon-carbon-overflow-menu-horizontal
                class="w-4 h-4 opacity-50 hover:opacity-100 cursor-pointer"
                @click.stop
              />
            </NDropdown>
          </div>
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
      <div ref="messagesContainer" class="flex-1 overflow-y-auto px-20 py-4">
        <div v-for="(msg, index) in appStore.messages" :key="index" class="mb-8 flex flex-col">
          <!-- User Message -->
          <div v-if="msg.role === 'user'" class="self-end max-w-[80%]">
            <!-- 图片 -->
            <img
              v-if="msg.imageData"
              :src="getImageUrl(msg.imageData)"
              class="rounded-lg mb-2 max-w-full"
              alt="User uploaded image"
            >
            <!-- 文本 -->
            <div class="bg-[#F3F3F3] dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm leading-relaxed">
              {{ msg.content }}
            </div>
          </div>

          <!-- Assistant Message -->
          <div v-else class="self-start max-w-[80%]">
            <!-- 图片 -->
            <img
              v-if="msg.imageData"
              :src="getImageUrl(msg.imageData)"
              class="rounded-lg mb-2 max-w-full shadow-md"
              alt="Screenshot or photo"
            >
            <!-- 文本 (只在有内容时显示) -->
            <div v-if="msg.content && msg.content !== '[图片]'" class="text-gray-900 dark:text-gray-100 text-sm leading-relaxed whitespace-pre-line">
              {{ msg.content }}
              <!-- 流式输出指示器 -->
              <span v-if="msg.isStreaming" class="inline-block w-2 h-4 ml-1 bg-gray-400 animate-pulse" />
            </div>
          </div>
        </div>
      </div>

      <!-- Input Area -->
      <div class="px-20 pb-8 pt-2">
        <!-- 活跃对话时显示输入框 -->
        <div v-if="appStore.isCurrentSessionToday || appStore.messages.length === 0" class="relative bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-3xl shadow-sm hover:shadow-md transition-shadow duration-200">
          <textarea
            v-model="inputValue"
            placeholder="发消息或输入 / 选择技能"
            class="w-full min-h-[56px] max-h-[200px] py-4 px-5 bg-transparent border-none outline-none resize-none text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400"
            rows="1"
            @keydown="handleKeydown"
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
              @click="sendMessage"
            >
              <icon-carbon-arrow-up class="w-4 h-4" />
            </NButton>
          </div>
        </div>

        <!-- 查看历史记录时显示提示 -->
        <div v-else class="text-center py-4">
          <NButton type="primary" @click="startNewConversation">
            <icon-carbon-add class="w-4 h-4 mr-2" />
            开启新对话
          </NButton>
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
