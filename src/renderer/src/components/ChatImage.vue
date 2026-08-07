<script setup lang="ts">
import { NImage } from 'naive-ui'
import { onUnmounted, ref, watch } from 'vue'
import { createObjectUrl, revokeObjectUrl } from '../utils/imageUtils'

type ImageDataInput = Uint8Array | { type?: string, data?: number[] } | number[] | { buffer: ArrayBuffer } | ArrayBuffer

const props = defineProps<{
  imageData?: ImageDataInput
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
  <NImage
    v-if="imageUrl"
    :src="imageUrl"
    :alt="alt || 'Image'"
    :class="className"
    object-fit="cover"
    :img-props="{ style: { borderRadius: '0.5rem' } }"
  />
</template>
