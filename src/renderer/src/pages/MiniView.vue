<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import { useEmotion } from '../composables/useEmotion'
import { useAppStore } from '../stores/app'
import { vPressDrag } from '../utils/press-drag'

const appStore = useAppStore()
const emotion = useEmotion({
  defaultEmotion: 'neutral',
})

watch(() => appStore.emotion, (newEmotion) => {
  emotion.setEmotion(newEmotion)
}, { immediate: true })

const pressDragHandlers = {
  onClick: () => {
    window.api.hideHover()
    window.api.togglePanel()
  },
  onDragStart: () => {
    window.api.hideHover()
    window.api.dragStart()
  },
  onDrag: () => {
    window.api.dragMove()
  },
  onDragEnd: () => {
    window.api.dragEnd()
  },
  onHoverEnter: () => {
    window.api.hoverMiniEnter()
    window.api.repositionHover()
  },
  onHoverLeave: () => {
    window.api.hoverMiniLeave()
  },
  preventRightClickMenu: true,
}

onMounted(() => {
  document.body.classList.add('mini-mode')
})

onUnmounted(() => {
  document.body.classList.remove('mini-mode')
})
</script>

<template>
  <div v-press-drag="pressDragHandlers" class="mini-root">
    <img
      :src="emotion.imageUrl.value"
      :alt="emotion.emotion.value"
      class="mini-avatar"
      draggable="false"
      @dragstart.prevent
    >
  </div>
</template>

<style scoped>
.mini-root {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  overflow: hidden;
  clip-path: circle(50% at 50% 50%);
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mini-avatar {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
  transition: opacity 0.3s ease;
  -webkit-user-drag: none;
  -webkit-user-select: none;
  user-select: none;
}
</style>

<style>
/* 让迷你窗体真正圆形：页面背景透明 */
body.mini-mode {
  background: transparent !important;
}
</style>
