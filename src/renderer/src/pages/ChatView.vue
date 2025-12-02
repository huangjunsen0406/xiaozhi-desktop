<script setup lang="ts">
import { NButton, NDropdown } from 'naive-ui'
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

import AudioWave from '../components/AudioWave.vue'
import ChatImage from '../components/ChatImage.vue'
import { useAppStore } from '../stores/app'

// UI 状态
const inputValue = ref('')
const isSidebarOpen = ref(true)
const messagesContainer = ref<HTMLElement>()

// 麦克风按钮的本地状态（用于立即响应，避免等待后端状态更新）
const isLocalListening = ref(false)

// 使用全局 App Store
const appStore = useAppStore()

// 监听后端状态变化，同步到本地状态
watch(
  () => appStore.isManualMode,
  (newValue) => {
    isLocalListening.value = newValue
  },
  { immediate: true },
)

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
  console.log('组件已挂载')

  // 加载会话列表
  await appStore.loadSessions()

  // 确保有当前会话
  if (!appStore.currentSessionId) {
    if (appStore.sessions.length > 0) {
      // 如果没有当前会话但有会话列表，切换到第一个
      console.log('切换到第一个会话:', appStore.sessions[0].sessionId)
      await switchSession(appStore.sessions[0].sessionId)
    }
    else {
      // 如果没有任何会话，创建今天的会话
      const sessionId = await appStore.getTodaySession()
      console.log('创建今天的会话:', sessionId)
      appStore.currentSessionId = sessionId
    }
  }
  else {
    // 如果已经有当前会话，直接使用全局共享的 messages，不重新加载
    console.log('使用当前会话:', appStore.currentSessionId, '消息数:', appStore.messages.length)
  }

  // 滚动到底部
  await nextTick()
  scrollToBottom()
})

/**
 * 组件卸载
 */
onUnmounted(() => {
  console.log('组件卸载')
})

/**
 * 发送消息
 * 互斥：如果有模式在运行，先停止
 */
async function sendMessage() {
  const text = inputValue.value.trim()
  if (!text)
    return

  try {
    console.log('发送消息:', text)

    // 互斥逻辑：停止任何正在运行的模式
    if (appStore.isAutoMode) {
      console.log('发送文本前停止自动模式')
      await appStore.stopAutoConversation()
    }
    if (isLocalListening.value || appStore.isManualMode) {
      console.log('发送文本前停止手动模式')
      isLocalListening.value = false
      await appStore.stopListeningManual()
    }

    // 等待状态稳定
    if (appStore.isAutoMode || appStore.isManualMode) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    // 确保有当前会话
    if (!appStore.currentSessionId) {
      const sessionId = await appStore.getTodaySession()
      await appStore.switchSession(sessionId)
    }

    // 清空输入框
    inputValue.value = ''

    // 滚动到底部
    await nextTick()
    scrollToBottom()

    // 发送到服务器
    // 后端会保存消息并通过 broadcastMessageAdded 广播事件
    // App.vue 监听事件后会自动 loadMessages 刷新界面
    await appStore.sendText(text)
  }
  catch (error) {
    console.error('发送消息失败', error)
  }
}

/**
 * 切换会话
 */
async function switchSession(sessionId: string) {
  console.log('请求切换会话:', sessionId)
  await appStore.switchSession(sessionId)

  // 滚动到底部
  await nextTick()
  scrollToBottom()

  console.log('会话已切换，当前会话ID:', appStore.currentSessionId, '消息数:', appStore.messages.length)
}

/**
 * 删除会话
 */
async function deleteSession(sessionId: string) {
  await appStore.deleteSession(sessionId)

  // 滚动到底部
  await nextTick()
  scrollToBottom()

  console.log('会话已删除')
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
 * 切换侧边栏
 */
function toggleSidebar() {
  isSidebarOpen.value = !isSidebarOpen.value
}

/**
 * 处理麦克风按钮点击
 * 智能判断：如果正在监听则停止，否则开始监听
 * 互斥：如果自动模式激活，先停止自动模式
 */
async function handleMicrophoneClick() {
  try {
    // 如果自动模式正在运行，先停止
    if (appStore.isAutoMode) {
      console.log('检测到自动模式激活，先停止自动模式')
      await appStore.stopAutoConversation()
      // 等待状态更新
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    // 如果正在监听（手动模式），则停止
    if (isLocalListening.value) {
      isLocalListening.value = false
      await appStore.stopListeningManual()
    }
    else {
      // 否则（包括空闲、说话等），立即设置本地状态，然后开始监听
      isLocalListening.value = true
      await appStore.startListeningManual()
    }
  }
  catch (error) {
    console.error('麦克风按钮点击处理失败', error)
    isLocalListening.value = false
  }
}

/**
 * 处理电话按钮点击（自动模式）
 * 互斥：如果手动模式激活，先停止手动模式
 */
async function handlePhoneClick() {
  try {
    // 如果手动模式正在运行，先停止
    if (isLocalListening.value || appStore.isManualMode) {
      console.log('检测到手动模式激活，先停止手动模式')
      isLocalListening.value = false
      await appStore.stopListeningManual()
      // 等待状态更新
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    // 切换自动模式
    if (appStore.isAutoMode) {
      await appStore.stopAutoConversation()
    }
    else {
      await appStore.startAutoConversation()
    }
  }
  catch (error) {
    console.error('电话按钮点击处理失败', error)
  }
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
      <div class="h-7 w-full shrink-0" style="-webkit-app-region: drag" />

      <!-- Sidebar Header -->
      <div class="px-4 pb-2 text-xs font-medium text-gray-400 whitespace-nowrap">
        <span :class="{ 'opacity-0': !isSidebarOpen }">历史对话</span>
      </div>

      <!-- History List -->
      <div class="flex-1 overflow-y-auto px-2 space-y-1">
        <div
          v-for="item in appStore.sessions"
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
              { label: '删除对话', key: 'delete', disabled: appStore.isCurrentSessionToday && item.sessionId === appStore.currentSessionId },
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
      <div class="h-7 w-full flex-shrink-0" style="-webkit-app-region: drag" />

      <!-- Messages Area -->
      <div ref="messagesContainer" class="flex-1 overflow-y-auto px-20 py-4">
        <div v-for="(msg, index) in appStore.messages" :key="index" class="mb-8 flex flex-col">
          <!-- User Message -->
          <div v-if="msg.role === 'user'" class="self-end max-w-[80%]">
            <!-- 图片 -->
            <ChatImage
              v-if="msg.imageData"
              :image-data="msg.imageData"
              class-name="rounded-lg mb-2 max-w-full"
              alt="User uploaded image"
            />
            <!-- 文本 -->
            <div class="bg-[#F3F3F3] dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm leading-relaxed">
              {{ msg.content }}
            </div>
          </div>

          <!-- Assistant Message -->
          <div v-else class="self-start max-w-[80%]">
            <!-- 图片 -->
            <ChatImage
              v-if="msg.imageData"
              :image-data="msg.imageData"
              class-name="rounded-lg mb-2 max-w-full shadow-md"
              alt="Screenshot or photo"
            />
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
            <!-- Phone Button: Auto Mode -->
            <NButton
              quaternary
              circle
              size="small"
              class="transition-colors duration-200"
              :class="[appStore.isAutoMode ? 'text-red-500 hover:text-red-600' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300']"
              @click="handlePhoneClick"
            >
              <icon-carbon-phone-block-filled v-if="appStore.isAutoMode" class="w-4 h-4" />
              <icon-carbon-phone v-else class="w-4 h-4" />
            </NButton>

            <!-- Microphone Button: Manual Mode -->
            <NButton
              quaternary
              circle
              size="small"
              class="transition-colors duration-200"
              :class="[isLocalListening ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300']"
              @click="handleMicrophoneClick"
            >
              <AudioWave v-if="isLocalListening" :active="true" class="w-4 h-4" />
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
        <div v-else class="text-center py-4 text-gray-400">
          这是历史记录，无法继续对话
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
