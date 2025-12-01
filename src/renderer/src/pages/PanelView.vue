<script setup lang="ts">
import { ref } from 'vue'
import { useAppStore } from '../stores/app'

const text = ref('')
const appStore = useAppStore()

// 发送文本消息
async function handleSendText() {
  const message = text.value.trim()
  if (!message) {
    return
  }

  // 清空输入框
  text.value = ''

  try {
    // 通过 store 发送文本
    await appStore.sendText(message)
  }
  catch (error) {
    console.error('发送文本失败', error)
  }
}

// 支持回车发送（Shift+Enter 换行）
function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    handleSendText()
  }
}
</script>

<template>
  <div class="w-full h-full flex items-center justify-center bg-transparent">
    <div class="w-[780px] rounded-[22px] p-4 backdrop-blur-md border border-black/10 dark:border-white/10 bg-white/80 dark:bg-[rgba(20,24,32,0.68)]" style="-webkit-app-region: drag">
      <div class="grid [grid-template-columns:1fr_auto] gap-[10px] items-center" style="-webkit-app-region: no-drag">
        <NInput
          v-model:value="text"
          type="textarea"
          :autosize="{ minRows: 4, maxRows: 4 }"
          placeholder="请输入…"
          @keydown="handleKeyDown"
        />
        <div class="flex items-center gap-[10px]">
          <NButton circle type="primary" size="small" @click="handleSendText">
            <icon-carbon-send-alt class="w-4 h-4 dark:text-white" />
          </NButton>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped></style>

<style>
/* 透明窗口：强制页面背景透明，避免黑色矩形 */
html, body, #app { background: transparent !important; }
</style>
