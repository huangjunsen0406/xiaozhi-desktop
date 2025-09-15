<script setup lang="ts">
import { useDark, useToggle } from '@vueuse/core'

function minimize(): void {
  window.electron?.ipcRenderer?.send('toggle-to-mini')
}

const isDark = useDark({ selector: 'html', attribute: 'class', valueDark: 'dark' })
const toggleDark = useToggle(isDark)
</script>

<template>
  <div class="main-view">
    <div class="titlebar">
      <div class="drag-area" />
    </div>
    <img src="../assets/icon.png" alt="robot" class="robot-large">
    <div class="title">
      请开始说话
    </div>
    <n-button type="primary">
      Primary
    </n-button>
    <n-button @click="toggleDark()">
      切换主题
    </n-button>
    <Dots />
    <n-button type="primary" @click="minimize">
      收起
    </n-button>
  </div>
</template>

<style scoped>
.main-view {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  height: 100svh;
  /* padding: 56px 20px 20px; */
  background: linear-gradient(180deg, #0b0f16 0%, #101722 100%);
  padding: 20px;
  box-sizing: border-box;
  overflow: hidden;
}
.main-view::before {
  content: '';
  position: absolute;
  inset: 0;
  background: url('../assets/wavy-lines.svg') no-repeat left 40% center / 80% auto;
  opacity: .35;
  pointer-events: none;
}

.robot-large {
  width: 72px;
  height: 72px;
  border-radius: 28px;
  object-fit: cover;
  /* box-shadow: 0 14px 40px rgba(0,0,0,0.35), 0 0 0 8px rgba(22, 119, 255, 0.06); */
  margin-top: 50px;
}

.title {
  font-size: 16px;
  color: rgba(255,255,255,.75);
}

.titlebar {
  position: fixed;
  top: 0; left: 0; right: 0;
  height: 40px;
  -webkit-app-region: drag;
}
.titlebar .drag-area { height: 100%; }

.btn {
  margin-top: 8px;
  border: 1px solid #2a2f3a;
  background: rgba(255,255,255,.04);
  border-radius: 10px;
  padding: 8px 16px;
  cursor: pointer;
}
.btn:hover { background: rgba(255,255,255,.08); }
</style>
