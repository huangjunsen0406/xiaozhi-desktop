<script setup lang="ts">
import { ref } from 'vue'

const text = ref('')
</script>

<template>
  <div class="w-full h-full flex items-center justify-center bg-transparent">
    <div class="w-[780px] rounded-[22px] p-4 backdrop-blur-md border border-black/10 dark:border-white/10 bg-white/80 dark:bg-[rgba(20,24,32,0.68)]" style="-webkit-app-region: drag">
      <div class="grid [grid-template-columns:1fr_auto] gap-[10px] items-center" style="-webkit-app-region: no-drag">
        <NInput v-model:value="text" type="textarea" :autosize="{ minRows: 4, maxRows: 4 }" placeholder="请输入…" />
        <div class="flex items-center gap-[10px]">
          <NButton circle type="primary" size="small">
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
