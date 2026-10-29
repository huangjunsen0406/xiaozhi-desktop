<script setup lang="ts">
import type { ModelInfo } from '@shared/types'
import type { SettingsPanelHandle } from '../../types/settings'
import { NButton, NEmpty, NPopconfirm, NSpin, NTooltip, useMessage } from 'naive-ui'
import { onMounted, ref } from 'vue'
import IconCarbonAdd from '~icons/carbon/add'
import IconCarbonCheckmark from '~icons/carbon/checkmark'
import IconCarbonFolder from '~icons/carbon/folder'
import IconCarbonTrashCan from '~icons/carbon/trash-can'

const message = useMessage()

// 模型列表
const models = ref<ModelInfo[]>([])
// 当前选中的模型
const currentModelId = ref<string>('')
// 加载状态
const loading = ref(false)
// 导入中状态
const importing = ref(false)
// 删除中的模型 ID
const deletingModelId = ref<string | null>(null)

/**
 * 加载模型列表
 */
async function loadModels() {
  loading.value = true
  try {
    const [list, current] = await Promise.all([
      window.api.modelGetList(),
      window.api.modelGetCurrent(),
    ])
    models.value = list
    currentModelId.value = current
  }
  catch {
    message.error('加载模型列表失败')
  }
  finally {
    loading.value = false
  }
}

/**
 * 切换模型
 */
async function handleSelectModel(modelId: string) {
  if (modelId === currentModelId.value)
    return

  try {
    await window.api.modelSetCurrent(modelId)
    currentModelId.value = modelId
    message.success('模型已切换，重启后生效')
  }
  catch {
    message.error('切换模型失败')
  }
}

/**
 * 导入模型
 */
async function handleImport() {
  try {
    // 打开文件夹选择器
    const result = await window.api.modelSelectFolder()
    if (result.canceled || !result.filePaths.length) {
      return
    }

    const sourcePath = result.filePaths[0]
    importing.value = true

    // 导入模型（返回 stableId；列表 name 来自 meta.displayName）
    const modelId = await window.api.modelImport(sourcePath)
    message.success(modelId ? `模型导入成功（${modelId}）` : '模型导入成功')

    // 刷新列表
    await loadModels()
  }
  catch {
    message.error('导入模型失败')
  }
  finally {
    importing.value = false
  }
}

/**
 * 删除模型
 */
async function handleDelete(modelId: string) {
  try {
    deletingModelId.value = modelId

    await window.api.modelDelete(modelId)
    message.success('模型已删除')

    // 刷新列表
    await loadModels()
  }
  catch {
    message.error('删除模型失败')
  }
  finally {
    deletingModelId.value = null
  }
}

/**
 * 打开模型目录
 */
async function handleOpenFolder() {
  try {
    await window.api.modelOpenFolder()
  }
  catch {
    message.error('打开目录失败')
  }
}

// 初始化
onMounted(() => {
  loadModels()
})

async function refreshModels() {
  await loadModels()
  message.success('已刷新模型列表')
}

const panel = {
  persistence: 'immediate',
  actions: { refreshModels: { label: '刷新列表', run: refreshModels } },
} satisfies SettingsPanelHandle

defineExpose(panel)
</script>

<template>
  <div>
    <!-- 顶部操作栏 -->
    <div class="flex items-center gap-2 mb-4">
      <NButton type="primary" size="small" :loading="importing" @click="handleImport">
        <template #icon>
          <IconCarbonAdd class="w-4 h-4" />
        </template>
        {{ importing ? '导入中...' : '导入模型' }}
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
      <!-- 模型卡片网格 -->
      <div class="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4">
        <!-- 虚线导入卡片 -->
        <div
          class="flex flex-col items-center justify-center min-h-[120px] gap-2 p-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl cursor-pointer transition-colors hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30"
          :class="{ 'opacity-60 cursor-not-allowed': importing }"
          @click="!importing && handleImport()"
        >
          <IconCarbonAdd class="w-8 h-8 text-gray-400" />
          <span class="text-sm text-gray-400">{{ importing ? '导入中...' : '导入模型' }}</span>
        </div>

        <!-- 模型卡片列表 -->
        <div
          v-for="model in models"
          :key="model.id"
          class="group relative flex flex-col items-center gap-2 p-3 rounded-xl cursor-pointer transition-colors border-2"
          :class="model.id === currentModelId
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 hover:border-blue-400'"
          @click="handleSelectModel(model.id)"
        >
          <!-- 预览图 -->
          <div class="relative w-full aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700">
            <img
              v-if="model.preview"
              :src="model.preview"
              :alt="model.name"
              class="block w-full h-full object-cover"
            >
            <div v-else class="flex items-center justify-center w-full h-full bg-gradient-to-br from-purple-400 to-purple-600 text-white text-2xl font-bold">
              <span>{{ model.name.charAt(0).toUpperCase() }}</span>
            </div>

            <!-- 选中角标 -->
            <div
              v-if="model.id === currentModelId"
              class="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-sm"
            >
              <IconCarbonCheckmark class="w-3 h-3" />
            </div>

            <!-- 删除按钮（hover 时显示） -->
            <NPopconfirm
              placement="top"
              positive-text="确定"
              negative-text="取消"
              @positive-click="handleDelete(model.id)"
            >
              <template #trigger>
                <NButton
                  circle
                  size="tiny"
                  type="error"
                  class="!absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  :loading="deletingModelId === model.id"
                  @click.stop
                >
                  <template #icon>
                    <IconCarbonTrashCan class="w-3 h-3" />
                  </template>
                </NButton>
              </template>
              确定要删除模型 "{{ model.name }}" 吗？
            </NPopconfirm>
          </div>

          <!-- 模型名称 -->
          <div class="text-sm font-medium text-gray-800 dark:text-gray-200 truncate w-full text-center">
            {{ model.name }}
          </div>

          <!-- 模型信息 -->
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
        </div>
      </div>

      <!-- 空状态 -->
      <NEmpty
        v-if="!loading && models.length === 0"
        description="暂无模型"
        class="mt-8"
      >
        <template #extra>
          <div class="text-sm text-gray-500 dark:text-gray-400 text-center">
            <p>请将 Live2D 模型文件夹复制到模型目录</p>
            <p class="mt-1">
              或点击上方"导入模型"按钮
            </p>
          </div>
        </template>
      </NEmpty>
    </NSpin>
  </div>
</template>
