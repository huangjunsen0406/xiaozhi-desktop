<script setup lang="ts">
import type { PetInfo } from '@shared/types'
import { NButton, NEmpty, NPopconfirm, NSpin, useMessage } from 'naive-ui'
import { onMounted, ref } from 'vue'
import IconCarbonAdd from '~icons/carbon/add'
import IconCarbonCheckmark from '~icons/carbon/checkmark'
import IconCarbonFolder from '~icons/carbon/folder'
import IconCarbonTrashCan from '~icons/carbon/trash-can'

const message = useMessage()

// 宠物列表
const pets = ref<PetInfo[]>([])
// 当前选中的宠物
const currentPetId = ref<string>('')
// 加载状态
const loading = ref(false)
// 导入中状态
const importing = ref(false)
// 删除中的宠物 ID
const deletingPetId = ref<string | null>(null)

/**
 * 加载宠物列表
 */
async function loadPets() {
  loading.value = true
  try {
    const [list, current] = await Promise.all([
      window.api.petsGetList(),
      window.api.petsGetCurrent(),
    ])
    pets.value = list
    currentPetId.value = current
  }
  catch {
    message.error('加载宠物列表失败')
  }
  finally {
    loading.value = false
  }
}

/**
 * 切换宠物
 */
async function handleSelectPet(petId: string) {
  if (petId === currentPetId.value)
    return

  try {
    await window.api.petsSetCurrent(petId)
    currentPetId.value = petId
    message.success('宠物已切换')
  }
  catch {
    message.error('切换宠物失败')
  }
}

/**
 * 导入宠物
 */
async function handleImport() {
  try {
    // 打开文件夹选择器
    const result = await window.api.petsSelectFolder()
    if (result.canceled || !result.filePaths.length) {
      return
    }

    const sourcePath = result.filePaths[0]
    importing.value = true

    // 导入宠物
    await window.api.petsImport(sourcePath)
    message.success('宠物导入成功')
    await loadPets()
  }
  catch {
    message.error('导入宠物失败')
  }
  finally {
    importing.value = false
  }
}

/**
 * 删除宠物
 */
async function handleDelete(petId: string) {
  try {
    deletingPetId.value = petId

    await window.api.petsDelete(petId)
    message.success('宠物已删除')
    await loadPets()
  }
  catch {
    message.error('删除宠物失败')
  }
  finally {
    deletingPetId.value = null
  }
}

/**
 * 打开宠物目录
 */
async function handleOpenFolder() {
  try {
    await window.api.petsOpenFolder()
  }
  catch {
    message.error('打开目录失败')
  }
}

// 初始化
onMounted(() => {
  loadPets()
})

// 暴露方法给父组件
defineExpose({
  handleSave: async () => {
    message.success('宠物设置已保存')
  },
  handleCustomButton: async () => {
    await loadPets()
    message.success('已刷新宠物列表')
  },
})
</script>

<template>
  <div>
    <!-- 顶部操作栏 -->
    <div class="flex items-center gap-2 mb-4">
      <NButton type="primary" size="small" :loading="importing" @click="handleImport">
        <template #icon>
          <IconCarbonAdd class="w-4 h-4" />
        </template>
        {{ importing ? '导入中...' : '导入宠物' }}
      </NButton>
      <NButton quaternary size="small" @click="handleOpenFolder">
        <template #icon>
          <IconCarbonFolder class="w-4 h-4" />
        </template>
        打开目录
      </NButton>
    </div>

    <!-- 加载状态 -->
    <NSpin :show="loading">
      <!-- 宠物卡片网格 -->
      <div class="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4">
        <!-- 虚线导入卡片 -->
        <div
          class="flex flex-col items-center justify-center min-h-[120px] gap-2 p-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl cursor-pointer transition-colors hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30"
          :class="{ 'opacity-60 cursor-not-allowed': importing }"
          @click="!importing && handleImport()"
        >
          <IconCarbonAdd class="w-8 h-8 text-gray-400" />
          <span class="text-sm text-gray-400">{{ importing ? '导入中...' : '导入宠物' }}</span>
        </div>

        <!-- 宠物卡片列表 -->
        <div
          v-for="pet in pets"
          :key="pet.id"
          class="group relative flex flex-col items-center gap-2 p-3 rounded-xl cursor-pointer transition-colors border-2"
          :class="pet.id === currentPetId
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 hover:border-blue-400'"
          @click="handleSelectPet(pet.id)"
        >
          <!-- 预览图区域：棋盘格背景 -->
          <div class="relative w-full aspect-[12/13] rounded-lg overflow-hidden checkerboard">
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

            <!-- 选中角标 -->
            <div
              v-if="pet.id === currentPetId"
              class="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-sm"
            >
              <IconCarbonCheckmark class="w-3 h-3" />
            </div>

            <!-- 删除按钮（仅本地；Codex 只读来源不可删） -->
            <NPopconfirm
              v-if="pet.source !== 'codex'"
              placement="top"
              positive-text="确定"
              negative-text="取消"
              @positive-click="handleDelete(pet.id)"
            >
              <template #trigger>
                <NButton
                  circle
                  size="tiny"
                  type="error"
                  class="!absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  :loading="deletingPetId === pet.id"
                  @click.stop
                >
                  <template #icon>
                    <IconCarbonTrashCan class="w-3 h-3" />
                  </template>
                </NButton>
              </template>
              确定要删除 "{{ pet.displayName }}" 吗？
            </NPopconfirm>
          </div>

          <!-- 宠物名称 + 来源标记 -->
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

          <!-- 宠物描述（单行截断） -->
          <div
            v-if="pet.description"
            class="text-[11px] text-gray-500 dark:text-gray-400 truncate w-full text-center"
          >
            {{ pet.description }}
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <NEmpty
        v-if="!loading && pets.length === 0"
        description="暂无宠物"
        class="mt-8"
      >
        <template #extra>
          <div class="text-sm text-gray-500 dark:text-gray-400 text-center">
            <p>请将宠物文件夹（包含 pet.json 和 spritesheet.webp）导入</p>
            <p class="mt-1">
              或点击上方"导入宠物"按钮
            </p>
          </div>
        </template>
      </NEmpty>
    </NSpin>
  </div>
</template>

<style scoped>
.checkerboard {
  background-color: #f0f0f0;
  background-image:
    linear-gradient(45deg, #ddd 25%, transparent 25%),
    linear-gradient(-45deg, #ddd 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #ddd 75%),
    linear-gradient(-45deg, transparent 75%, #ddd 75%);
  background-size: 16px 16px;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0px;
}

:global(.dark) .checkerboard {
  background-color: #2a2a2a;
  background-image:
    linear-gradient(45deg, #333 25%, transparent 25%),
    linear-gradient(-45deg, #333 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #333 75%),
    linear-gradient(-45deg, transparent 75%, #333 75%);
}
</style>
