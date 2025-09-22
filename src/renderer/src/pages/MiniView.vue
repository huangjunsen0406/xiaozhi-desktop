<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { vPressDrag } from '../utils/press-drag'

let rafId: number | null = null
let accDx = 0
let accDy = 0

function flushMove(): void {
  if (accDx !== 0 || accDy !== 0)
    window.api.moveBy(accDx, accDy)
  accDx = 0
  accDy = 0
  rafId = null
}

const pressDragHandlers = {
  onClick: () => {
    window.api.togglePanel()
  },
  onDrag: (_ev: PointerEvent, state: any) => {
    const dx = state.current.x - state.last.x
    const dy = state.current.y - state.last.y
    accDx += dx
    accDy += dy
    if (rafId == null)
      rafId = requestAnimationFrame(flushMove)
  },
  onDragEnd: () => {
    if (rafId != null)
      cancelAnimationFrame(rafId)
    flushMove()
  },
  // 右键
  onRightClick: () => {
    window.api.toggleToMain()
  },
  preventRightClickMenu: true,
}

onMounted(() => {
  document.body.classList.add('mini-mode')
})
onUnmounted(() => {
  document.body.classList.remove('mini-mode')
  if (rafId != null)
    cancelAnimationFrame(rafId)
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
