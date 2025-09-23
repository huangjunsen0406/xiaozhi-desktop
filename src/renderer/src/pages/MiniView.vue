<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { vPressDrag } from '../utils/press-drag'

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
    <img src="../assets/icon.png" class="mini-avatar" alt="mini" draggable="false" @dragstart.prevent>
  </div>
</template>

<style scoped>
.mini-root {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mini-avatar {
  width: 100%;
  height: 100%;
  object-fit: cover;
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
