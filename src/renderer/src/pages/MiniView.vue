<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

onMounted(() => {
  document.body.classList.add('mini-mode')
})
onUnmounted(() => {
  document.body.classList.remove('mini-mode')
})
</script>

<template>
  <div class="mini-root">
    <img src="../assets/icon.png" class="mini-avatar" alt="mini">
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
  -webkit-app-region: drag;
}

.mini-avatar {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>

<style>
/* 让迷你窗体真正圆形：页面背景透明 */
body.mini-mode {
  background: transparent !important;
}
</style>
