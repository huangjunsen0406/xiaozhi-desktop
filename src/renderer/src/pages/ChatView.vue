<script setup lang="ts">
import { NButton, NDropdown } from 'naive-ui'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import AudioWave from '../components/AudioWave.vue'
import ChatMessage from '../components/ChatMessage.vue'
import TitleBar from '../components/TitleBar.vue'
import { useAppStore } from '../stores/app'

const isMac = window.api.getPlatform() === 'darwin'
const inputValue = ref('')
const isSidebarOpen = ref(true)
const messagesContainer = ref<HTMLElement>()
const appStore = useAppStore()
const messageKeys = computed(() =>
  appStore.messages.map(message => message.id ?? `${message.timestamp}-${message.role}`),
)

watch(() => appStore.messages.length, async (length, previous) => {
  if (length > previous) {
    await nextTick()
    scrollToBottom()
  }
})

onMounted(async () => {
  await appStore.ensureSelectedSession()
  await nextTick()
  scrollToBottom()
})

async function sendMessage(): Promise<void> {
  const text = inputValue.value.trim()
  if (!text || appStore.isConversationPending)
    return
  try {
    await appStore.submitText(text)
    if (inputValue.value.trim() === text)
      inputValue.value = ''
  }
  catch (error) {
    console.error('发送消息失败', error)
  }
}

async function switchSession(sessionId: string): Promise<void> {
  await appStore.switchSession(sessionId)
  await nextTick()
  scrollToBottom()
}

async function deleteSession(sessionId: string): Promise<void> {
  try {
    await appStore.deleteSession(sessionId)
  }
  catch (error) {
    console.error('删除会话失败', error)
  }
}

function scrollToBottom(): void {
  if (messagesContainer.value)
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
}

function toggleSidebar(): void {
  isSidebarOpen.value = !isSidebarOpen.value
}

async function handleMicrophoneClick(): Promise<void> {
  try {
    await appStore.toggleManualListening()
  }
  catch (error) {
    console.error('切换手动监听失败', error)
  }
}

async function handlePhoneClick(): Promise<void> {
  try {
    await appStore.toggleAutoConversation()
  }
  catch (error) {
    console.error('切换自动对话失败', error)
  }
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    void sendMessage()
  }
}
</script>

<template>
  <div class="flex flex-col w-full h-screen overflow-hidden bg-white dark:bg-gray-900 font-sans">
    <!-- Win/Linux 无边框：顶部自定义标题栏（最小化 / 最大化 / 关闭） -->
    <TitleBar v-if="!isMac" />

    <div class="flex flex-1 min-h-0 overflow-hidden">
      <!-- Sidebar -->
      <div
        class="flex-shrink-0 bg-[#F7F7F7] dark:bg-gray-800 flex flex-col border-r border-gray-100 dark:border-gray-700 transition-all duration-300 ease-in-out overflow-hidden"
        :class="[isSidebarOpen ? 'w-64' : 'w-[68px]']"
      >
        <!-- mac 顶部拖拽区：左侧 no-drag 给红绿灯 -->
        <div
          v-if="isMac"
          class="w-full h-11 shrink-0 flex items-stretch"
          style="-webkit-app-region: drag"
        >
          <div class="w-[76px] shrink-0" style="-webkit-app-region: no-drag" />
          <div class="flex-1" />
        </div>

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
            <div class="flex-1 min-w-0" :class="{ 'opacity-0': !isSidebarOpen }">
              <div class="truncate">
                {{ item.preview || item.title }}
              </div>
            </div>
            <NDropdown
              v-if="item.active && isSidebarOpen"
              trigger="click"
              :options="[
                { label: '删除对话', key: 'delete', disabled: false },
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
      <div class="flex-1 flex flex-col relative bg-white dark:bg-gray-900 min-w-0">
        <!-- mac 顶部拖拽区；Win/Linux 已有 TitleBar，这里不再占位 -->
        <div
          v-if="isMac"
          class="w-full h-11 flex-shrink-0"
          style="-webkit-app-region: drag"
        />

        <!-- Messages Area -->
        <div ref="messagesContainer" class="flex-1 overflow-y-auto px-20 py-4">
          <ChatMessage
            v-for="(msg, index) in appStore.messages"
            :key="messageKeys[index]"
            :message="msg"
          />
        </div>

        <!-- Input Area：按 session 管理后始终可输入 -->
        <div class="px-20 pb-8 pt-2">
          <div class="relative bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-3xl shadow-sm hover:shadow-md transition-shadow duration-200">
            <textarea
              v-model="inputValue"
              placeholder="发消息或输入"
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
                :class="[appStore.isAutoConversationActive ? 'text-red-500 hover:text-red-600' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300']"
                :disabled="appStore.isConversationPending"
                @click="handlePhoneClick"
              >
                <icon-carbon-phone-block-filled v-if="appStore.isAutoConversationActive" class="w-4 h-4" />
                <icon-carbon-phone v-else class="w-4 h-4" />
              </NButton>

              <!-- Microphone Button: Manual Mode -->
              <NButton
                quaternary
                circle
                size="small"
                class="transition-colors duration-200"
                :class="[appStore.isManualListening ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300']"
                :disabled="appStore.isConversationPending"
                @click="handleMicrophoneClick"
              >
                <AudioWave v-if="appStore.isManualListening" :active="true" class="w-4 h-4" />
                <icon-carbon-microphone v-else class="w-4 h-4" />
              </NButton>
              <NButton
                circle
                size="small"
                class="bg-[#E5E5E5] dark:bg-gray-700 text-white dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 border-none"
                :disabled="!inputValue.trim() || appStore.isConversationPending"
                @click="sendMessage"
              >
                <icon-carbon-arrow-up class="w-4 h-4" />
              </NButton>
            </div>
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
