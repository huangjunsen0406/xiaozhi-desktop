<script setup lang="ts" generic="T extends { id: string }">
import type { Ref } from 'vue'
import { NButton, NEmpty, NPopconfirm, NSpin, useMessage } from 'naive-ui'
import { onMounted, ref } from 'vue'
import IconCarbonAdd from '~icons/carbon/add'
import IconCarbonCheckmark from '~icons/carbon/checkmark'
import IconCarbonFolder from '~icons/carbon/folder'
import IconCarbonTrashCan from '~icons/carbon/trash-can'

export interface AssetGalleryApi<TItem> {
  getList: () => Promise<TItem[]>
  getCurrent: () => Promise<string>
  setCurrent: (id: string) => Promise<void>
  selectFolder: () => Promise<{ canceled: boolean, filePaths: string[] }>
  importItem: (sourcePath: string) => Promise<string | void>
  deleteItem: (id: string) => Promise<void>
  openFolder: () => Promise<void>
}

const props = withDefaults(defineProps<{
  entityName: string
  api: AssetGalleryApi<T>
  getItemLabel: (item: T) => string
  previewBoxClass?: string
  selectSuccessText?: string
  emptyHint: string
  canDelete?: (item: T) => boolean
  formatImportSuccess?: (importedId: string | void) => string
  deleteConfirmText?: (item: T) => string
}>(), {
  previewBoxClass: 'aspect-square bg-gray-100 dark:bg-gray-700',
  canDelete: () => true,
})

const message = useMessage()

const items = ref([]) as Ref<T[]>
const currentId = ref('')
const loading = ref(false)
const importing = ref(false)
const deletingId = ref<string | null>(null)

async function loadItems(): Promise<void> {
  loading.value = true
  try {
    const [list, current] = await Promise.all([
      props.api.getList(),
      props.api.getCurrent(),
    ])
    items.value = list
    currentId.value = current
  }
  catch {
    message.error(`加载${props.entityName}列表失败`)
  }
  finally {
    loading.value = false
  }
}

async function handleSelect(id: string): Promise<void> {
  if (id === currentId.value)
    return

  try {
    await props.api.setCurrent(id)
    currentId.value = id
    message.success(props.selectSuccessText ?? `${props.entityName}已切换`)
  }
  catch {
    message.error(`切换${props.entityName}失败`)
  }
}

async function handleImport(): Promise<void> {
  try {
    const result = await props.api.selectFolder()
    if (result.canceled || !result.filePaths.length)
      return

    importing.value = true
    const importedId = await props.api.importItem(result.filePaths[0])
    const successText = props.formatImportSuccess
      ? props.formatImportSuccess(importedId)
      : `${props.entityName}导入成功`
    message.success(successText)
    await loadItems()
  }
  catch {
    message.error(`导入${props.entityName}失败`)
  }
  finally {
    importing.value = false
  }
}

async function handleDelete(id: string): Promise<void> {
  try {
    deletingId.value = id
    await props.api.deleteItem(id)
    message.success(`${props.entityName}已删除`)
    await loadItems()
  }
  catch {
    message.error(`删除${props.entityName}失败`)
  }
  finally {
    deletingId.value = null
  }
}

async function handleOpenFolder(): Promise<void> {
  try {
    await props.api.openFolder()
  }
  catch {
    message.error('打开目录失败')
  }
}

async function refresh(): Promise<void> {
  await loadItems()
  message.success(`已刷新${props.entityName}列表`)
}

onMounted(() => {
  void loadItems()
})

defineExpose({ refresh })
</script>

<template>
  <div>
    <!-- 顶部操作栏 -->
    <div class="flex items-center gap-2 mb-4">
      <NButton type="primary" size="small" :loading="importing" @click="handleImport">
        <template #icon>
          <IconCarbonAdd class="w-4 h-4" />
        </template>
        {{ importing ? '导入中...' : `导入${entityName}` }}
      </NButton>
      <NButton quaternary size="small" @click="handleOpenFolder">
        <template #icon>
          <IconCarbonFolder class="w-4 h-4" />
        </template>
        打开目录
      </NButton>
    </div>

    <NSpin :show="loading">
      <div class="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4">
        <!-- 虚线导入卡片 -->
        <div
          class="flex flex-col items-center justify-center min-h-[120px] gap-2 p-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl cursor-pointer transition-colors hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30"
          :class="{ 'opacity-60 cursor-not-allowed': importing }"
          @click="!importing && handleImport()"
        >
          <IconCarbonAdd class="w-8 h-8 text-gray-400" />
          <span class="text-sm text-gray-400">{{ importing ? '导入中...' : `导入${entityName}` }}</span>
        </div>

        <!-- 资源卡片列表 -->
        <div
          v-for="item in items"
          :key="item.id"
          class="group relative flex flex-col items-center gap-2 p-3 rounded-xl cursor-pointer transition-colors border-2"
          :class="item.id === currentId
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 hover:border-blue-400'"
          @click="handleSelect(item.id)"
        >
          <!-- 预览区域 -->
          <div class="relative w-full rounded-lg overflow-hidden" :class="previewBoxClass">
            <slot name="preview" :item="item" />

            <!-- 选中角标 -->
            <div
              v-if="item.id === currentId"
              class="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-sm"
            >
              <IconCarbonCheckmark class="w-3 h-3" />
            </div>

            <!-- 删除按钮（hover 时显示） -->
            <NPopconfirm
              v-if="canDelete(item)"
              placement="top"
              positive-text="确定"
              negative-text="取消"
              @positive-click="handleDelete(item.id)"
            >
              <template #trigger>
                <NButton
                  circle
                  size="tiny"
                  type="error"
                  class="!absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  :loading="deletingId === item.id"
                  @click.stop
                >
                  <template #icon>
                    <IconCarbonTrashCan class="w-3 h-3" />
                  </template>
                </NButton>
              </template>
              {{ deleteConfirmText ? deleteConfirmText(item) : `确定要删除 "${getItemLabel(item)}" 吗？` }}
            </NPopconfirm>
          </div>

          <slot name="title" :item="item">
            <div class="text-sm font-medium text-gray-800 dark:text-gray-200 truncate w-full text-center">
              {{ getItemLabel(item) }}
            </div>
          </slot>

          <slot name="footer" :item="item" />
        </div>
      </div>

      <!-- 空状态 -->
      <NEmpty
        v-if="!loading && items.length === 0"
        :description="`暂无${entityName}`"
        class="mt-8"
      >
        <template #extra>
          <div class="text-sm text-gray-500 dark:text-gray-400 text-center">
            <p>{{ emptyHint }}</p>
            <p class="mt-1">
              或点击上方"导入{{ entityName }}"按钮
            </p>
          </div>
        </template>
      </NEmpty>
    </NSpin>
  </div>
</template>
