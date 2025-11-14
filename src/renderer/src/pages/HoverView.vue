<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

const open = ref(false)

onMounted(() => {
  requestAnimationFrame(() => {
    open.value = true
  })
})

function handleEnter() {
  window.api.hoverWindowEnter()
}
function handleLeave() {
  window.api.hoverWindowLeave()
}

function handleMain() {
  window.api.hideHover()
  window.api.toggleToMain()
}

function handleSettings() {
  window.api.hideHover()
  window.api.toggleSettings()
}

onUnmounted(() => {
  window.api.hoverWindowLeave()
})
</script>

<template>
  <div class="w-[260px] h-[150px] p-0 m-0 select-none hover-root" @mouseenter="handleEnter" @mouseleave="handleLeave">
    <div
      class="h-full rounded-2xl bg-neutral-100/95 dark:bg-neutral-800/90 shadow-xl overflow-hidden transition-all duration-200 ease-out origin-left"
      :class="open ? 'opacity-100 scale-x-100' : 'opacity-0 scale-x-90'"
    >
      <div class="flex flex-col divide-y divide-black/5 dark:divide-white/10">
        <button class="h-18 px-5 text-[16px] text-neutral-900 dark:text-neutral-200 text-left hover:bg-black/5 dark:hover:bg-white/5" @click="handleMain">
          主界面
        </button>
        <button class="h-18 px-5 text-[16px] text-neutral-900 dark:text-neutral-200 text-left hover:bg-black/5 dark:hover:bg-white/5" @click="handleSettings">
          设置
        </button>
      </div>
    </div>
  </div>
</template>

<style>
/* 保持透明背景，适配独立窗口 */
html, body { background: transparent !important; }
</style>
