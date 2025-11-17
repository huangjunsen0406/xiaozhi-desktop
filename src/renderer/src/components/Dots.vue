<script setup lang="ts">
withDefaults(defineProps<{
  isShow?: boolean
}>(), {
  isShow: false,
})
</script>

<template>
  <div class="dots" :class="[isShow ? 'visible' : 'collapse']">
    <span />
    <span />
    <span />
  </div>
</template>

<style scoped>
.dots { display: flex; gap: 6px; }
.dots span {
  width: 8px; height: 8px; background: #666; border-radius: 50%;
  animation: blink 1.4s infinite ease-in-out both;
}
.dots span:nth-child(1) { animation-delay: -0.32s; }
.dots span:nth-child(2) { animation-delay: -0.16s; }

@keyframes blink {
  0%, 80%, 100% { transform: scale(0); opacity: .5; }
  40% { transform: scale(1); opacity: 1; }
}
</style>
