<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import { createObjectUrl, revokeObjectUrl } from '../utils/imageUtils'

const props = defineProps<{
  imageData?: Uint8Array | any
  alt?: string
  className?: string
}>()

const imageUrl = ref('')

// 监听 imageData 变化，更新 Object URL
watch(
  () => props.imageData,
  (newData) => {
    // 释放旧的 URL
    if (imageUrl.value) {
      revokeObjectUrl(imageUrl.value)
    }

    if (newData) {
      imageUrl.value = createObjectUrl(newData)
    }
    else {
      imageUrl.value = ''
    }
  },
  { immediate: true },
)

// 组件卸载时释放 URL
onUnmounted(() => {
  if (imageUrl.value) {
    revokeObjectUrl(imageUrl.value)
  }
})
</script>

<template>
  <img
    v-if="imageUrl"
    :src="imageUrl"
    :alt="alt || 'Image'"
    :class="className"
    loading="lazy"
  >
</template>
