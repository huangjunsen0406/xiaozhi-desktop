<script setup lang="ts">
import type { ChatMessage } from '../types/chat'
import ChatImage from './ChatImage.vue'

defineProps<{
  message: ChatMessage
}>()
</script>

<template>
  <div class="mb-8 flex flex-col">
    <!-- User Message -->
    <div v-if="message.role === 'user'" class="self-end max-w-[80%]">
      <!-- 图片 -->
      <ChatImage
        v-if="message.imageData"
        :image-data="message.imageData"
        class-name="rounded-lg mb-2 max-w-full"
        alt="User uploaded image"
      />
      <!-- 文本 -->
      <div class="bg-[#F3F3F3] dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm leading-relaxed">
        {{ message.content }}
      </div>
    </div>

    <!-- Assistant Message -->
    <div v-else class="self-start max-w-[80%]">
      <!-- 图片 -->
      <ChatImage
        v-if="message.imageData"
        :image-data="message.imageData"
        class-name="rounded-lg mb-2 max-w-full shadow-md"
        alt="Screenshot or photo"
      />
      <!-- 文本 (只在有内容时显示) -->
      <div v-if="message.content && message.content !== '[图片]'" class="text-gray-900 dark:text-gray-100 text-sm leading-relaxed whitespace-pre-line">
        {{ message.content }}
        <!-- 流式输出指示器 -->
        <span v-if="message.isStreaming" class="inline-block w-2 h-4 ml-1 bg-gray-400 animate-pulse" />
      </div>
    </div>
  </div>
</template>
