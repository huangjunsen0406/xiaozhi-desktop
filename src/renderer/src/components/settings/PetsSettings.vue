<script setup lang="ts">
import type { PetInfo } from '@shared/types'
import type { SettingsPanelHandle } from '../../types/settings'
import type { AssetGalleryApi } from './AssetGallerySettings.vue'
import { ref } from 'vue'
import AssetGallerySettings from './AssetGallerySettings.vue'

const galleryRef = ref<{ refresh: () => Promise<void> } | null>(null)

const api: AssetGalleryApi<PetInfo> = {
  getList: () => window.api.petsGetList(),
  getCurrent: () => window.api.petsGetCurrent(),
  setCurrent: id => window.api.petsSetCurrent(id),
  selectFolder: () => window.api.petsSelectFolder(),
  importItem: sourcePath => window.api.petsImport(sourcePath),
  deleteItem: id => window.api.petsDelete(id),
  openFolder: () => window.api.petsOpenFolder(),
}

const panel = {
  persistence: 'immediate',
  actions: {
    refreshPets: {
      label: '刷新列表',
      run: async () => {
        await galleryRef.value?.refresh()
      },
    },
  },
} satisfies SettingsPanelHandle

defineExpose(panel)
</script>

<template>
  <AssetGallerySettings
    ref="galleryRef"
    entity-name="宠物"
    :api="api"
    :get-item-label="pet => pet.displayName"
    :can-delete="pet => pet.source !== 'codex'"
    preview-box-class="aspect-[12/13] checkerboard"
    empty-hint="请将宠物文件夹（包含 pet.json 和 spritesheet.webp）导入"
  >
    <template #preview="{ item: pet }">
      <img
        v-if="pet.previewBase64"
        :src="pet.previewBase64"
        :alt="pet.displayName"
        class="w-full h-full object-contain"
        style="image-rendering: pixelated;"
      >
      <img
        v-else-if="pet.previewUrl"
        :src="pet.previewUrl"
        :alt="pet.displayName"
        class="absolute top-0 left-0 w-[800%] max-w-none h-auto"
        style="image-rendering: pixelated;"
      >
      <div v-else class="flex items-center justify-center w-full h-full text-gray-400 text-2xl font-bold">
        <span>{{ pet.displayName.charAt(0).toUpperCase() }}</span>
      </div>
    </template>

    <template #title="{ item: pet }">
      <div class="flex items-center justify-center gap-1 w-full min-w-0">
        <div class="text-sm font-medium text-gray-800 dark:text-gray-200 truncate text-center">
          {{ pet.displayName }}
        </div>
        <span
          v-if="pet.source === 'codex'"
          class="shrink-0 text-[10px] px-1 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
          title="来自 ~/.codex/pets（只读）"
        >
          Codex
        </span>
      </div>
    </template>

    <template #footer="{ item: pet }">
      <div
        v-if="pet.description"
        class="text-[11px] text-gray-500 dark:text-gray-400 truncate w-full text-center"
      >
        {{ pet.description }}
      </div>
    </template>
  </AssetGallerySettings>
</template>

<style scoped>
:deep(.checkerboard) {
  background-color: #f0f0f0;
  background-image:
    linear-gradient(45deg, #ddd 25%, transparent 25%),
    linear-gradient(-45deg, #ddd 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #ddd 75%),
    linear-gradient(-45deg, transparent 75%, #ddd 75%);
  background-size: 16px 16px;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0px;
}

:global(.dark) :deep(.checkerboard) {
  background-color: #2a2a2a;
  background-image:
    linear-gradient(45deg, #333 25%, transparent 25%),
    linear-gradient(-45deg, #333 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #333 75%),
    linear-gradient(-45deg, transparent 75%, #333 75%);
}
</style>
