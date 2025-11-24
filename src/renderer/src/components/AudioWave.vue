<script setup lang="ts">
defineProps<{
  active?: boolean
}>()
</script>

<template>
  <div class="flex items-center justify-center gap-[2px] h-4 w-4">
    <div class="bar" :class="{ active }" />
    <div class="bar" :class="{ active }" />
    <div class="bar" :class="{ active }" />
    <div class="bar" :class="{ active }" />
  </div>
</template>

<style scoped>
.bar {
  width: 2px;
  height: 4px;
  background-color: currentColor;
  border-radius: 1px;
  transition: height 0.2s ease;
}

.bar.active {
  animation: wave 1s ease-in-out infinite;
}

.bar:nth-child(1) { animation-delay: 0.0s; }
.bar:nth-child(2) { animation-delay: 0.1s; height: 6px; }
.bar:nth-child(3) { animation-delay: 0.2s; height: 8px; }
.bar:nth-child(4) { animation-delay: 0.3s; height: 5px; }

@keyframes wave {
  0%, 100% { height: 4px; }
  50% { height: 12px; }
}
</style>
