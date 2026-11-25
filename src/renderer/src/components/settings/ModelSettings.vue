<script setup lang="ts">
import type { ModelInfo } from '@shared/types'
import type { SettingsPanelHandle } from '../../types/settings'
import type { AssetGalleryApi } from './AssetGallerySettings.vue'
import { NTooltip } from 'naive-ui'
import { ref } from 'vue'
import AssetGallerySettings from './AssetGallerySettings.vue'

const galleryRef = ref<{ refresh: () => Promise<void> } | null>(null)

const api: AssetGalleryApi<ModelInfo> = {
  getList: () => window.api.modelGetList(),
  getCurrent: () => window.api.modelGetCurrent(),
  setCurrent: id => window.api.modelSetCurrent(id),
  selectFolder: () => window.api.modelSelectFolder(),
  importItem: sourcePath => window.api.modelImport(sourcePath),
  deleteItem: id => window.api.modelDelete(id),
  openFolder: () => window.api.modelOpenFolder(),
}

const panel = {
  persistence: 'immediate',
  actions: {
    refreshModels: {
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
    entity-name="模型"
    :api="api"
    :get-item-label="model => model.name"
    select-success-text="模型已切换，重启后生效"
    :format-import-success="id => id ? `模型导入成功（${id}）` : '模型导入成功'"
    :delete-confirm-text="model => `确定要删除模型 &quot;${model.name}&quot; 吗？`"
    empty-hint="请将 Live2D 模型文件夹复制到模型目录"
  >
    <template #preview="{ item: model }">
      <img
        v-if="model.preview"
        :src="model.preview"
        :alt="model.name"
        class="block w-full h-full object-cover"
      >
      <div v-else class="flex items-center justify-center w-full h-full bg-gradient-to-br from-purple-400 to-purple-600 text-white text-2xl font-bold">
        <span>{{ model.name.charAt(0).toUpperCase() }}</span>
      </div>
    </template>

    <template #footer="{ item: model }">
      <div class="flex gap-1 flex-wrap justify-center">
        <NTooltip trigger="hover">
          <template #trigger>
            <span class="text-[11px] px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
              {{ model.expressionCount }} 表情
            </span>
          </template>
          {{ model.hasExpressions ? `${model.expressionCount} 个表情` : '无表情' }}
        </NTooltip>
        <NTooltip trigger="hover">
          <template #trigger>
            <span class="text-[11px] px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
              {{ model.motionCount }} 动作
            </span>
          </template>
          {{ model.hasMotions ? `${model.motionCount} 个动作` : '无动作' }}
        </NTooltip>
      </div>
    </template>
  </AssetGallerySettings>
</template>
